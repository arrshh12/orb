/**
 * Auto-configuration engine for Orb.
 * Computes VRAM estimates, selects training parameters, and estimates time.
 * This is the "safety layer" that prevents OOM errors and sets sane defaults.
 */

import type { HardwareInfo } from '../types/hardware.js';
import type { ModelInfo } from '../types/model.js';
import type { DatasetMeta } from '../types/dataset.js';
import type {
  AutoConfigResult,
  VRAMEstimate,
  TimeEstimate,
  LoraConfig,
  TrainingParams,
} from '../types/config.js';
import { getEffectiveVRAM } from './hardware.js';
import { formatGB } from '../utils/formatting.js';

// ─── VRAM Estimation ─────────────────────────────────────────────────────────

/** Rough tokens/sec benchmarks by hardware tier for time estimation */
const TOKENS_PER_SEC_ESTIMATES: Record<string, { low: number; high: number }> = {
  // NVIDIA GPUs (by VRAM tier)
  'nvidia_8gb': { low: 200, high: 500 },
  'nvidia_12gb': { low: 350, high: 800 },
  'nvidia_16gb': { low: 500, high: 1000 },
  'nvidia_24gb': { low: 700, high: 1500 },
  'nvidia_48gb': { low: 1000, high: 2500 },
  // Apple Silicon (by unified memory tier)
  'apple_8gb': { low: 50, high: 150 },
  'apple_16gb': { low: 100, high: 250 },
  'apple_32gb': { low: 200, high: 400 },
  'apple_64gb': { low: 300, high: 600 },
  'apple_96gb': { low: 350, high: 700 },
};

function getSpeedTier(hw: HardwareInfo): { low: number; high: number } {
  const vramMB = getEffectiveVRAM(hw);
  const vramGB = vramMB / 1024;

  if (hw.gpu.type === 'nvidia') {
    if (vramGB <= 8) return TOKENS_PER_SEC_ESTIMATES['nvidia_8gb']!;
    if (vramGB <= 12) return TOKENS_PER_SEC_ESTIMATES['nvidia_12gb']!;
    if (vramGB <= 16) return TOKENS_PER_SEC_ESTIMATES['nvidia_16gb']!;
    if (vramGB <= 24) return TOKENS_PER_SEC_ESTIMATES['nvidia_24gb']!;
    return TOKENS_PER_SEC_ESTIMATES['nvidia_48gb']!;
  }

  if (hw.gpu.type === 'apple-silicon') {
    if (vramGB <= 8) return TOKENS_PER_SEC_ESTIMATES['apple_8gb']!;
    if (vramGB <= 16) return TOKENS_PER_SEC_ESTIMATES['apple_16gb']!;
    if (vramGB <= 32) return TOKENS_PER_SEC_ESTIMATES['apple_32gb']!;
    if (vramGB <= 64) return TOKENS_PER_SEC_ESTIMATES['apple_64gb']!;
    return TOKENS_PER_SEC_ESTIMATES['apple_96gb']!;
  }

  return { low: 10, high: 50 }; // CPU fallback (shouldn't happen)
}

/**
 * Estimate VRAM usage for a given model + training config.
 * Conservative estimates to avoid OOM.
 */
export function estimateVRAM(
  model: ModelInfo,
  config: {
    loraRank?: number;
    batchSize?: number;
    seqLength?: number;
    use8BitOptimizer?: boolean;
  },
): VRAMEstimate {
  const paramsBillions = model.parameterCount / 1e9;

  // Base model in 4-bit: 0.5 bytes/param
  const modelGB = paramsBillions * 0.5;

  // LoRA trainable params: ~1% of total params for "all-linear" target
  // More precisely: 2 * rank * hidden_size * num_target_modules (roughly 2 per layer * num_layers)
  const rank = config.loraRank ?? 16;
  const numTargetModules = model.numLayers * 4; // rough: 4 linear layers per transformer block
  const trainableParams = 2 * rank * model.hiddenSize * numTargetModules;
  const loraGB = (trainableParams * 2) / (1024 ** 3); // fp16

  // Optimizer states: AdamW = 8 bytes/param, 8-bit Adam = 2 bytes/param
  const use8bit = config.use8BitOptimizer ?? true;
  const optimizerGB = (trainableParams * (use8bit ? 2 : 8)) / (1024 ** 3);

  // Gradients: 2 bytes/param (fp16)
  const gradientsGB = (trainableParams * 2) / (1024 ** 3);

  // Activations: highly variable. With gradient checkpointing, roughly:
  // batch_size * seq_len * hidden_size * 2 bytes * sqrt(num_layers) / 1GB
  // This is a rough heuristic — real usage varies by architecture
  const batchSize = config.batchSize ?? 1;
  const seqLen = config.seqLength ?? 512;
  const activationGB = (batchSize * seqLen * model.hiddenSize * 2 * Math.sqrt(model.numLayers)) / (1024 ** 3);

  // Framework overhead: CUDA context + Python runtime + fragmentation
  const overheadGB = 2.0;

  const totalGB = modelGB + loraGB + optimizerGB + gradientsGB + activationGB + overheadGB;

  return {
    modelGB: Math.round(modelGB * 100) / 100,
    loraGB: Math.round(loraGB * 100) / 100,
    optimizerGB: Math.round(optimizerGB * 100) / 100,
    gradientsGB: Math.round(gradientsGB * 100) / 100,
    activationGB: Math.round(activationGB * 100) / 100,
    overheadGB,
    totalGB: Math.round(totalGB * 10) / 10,
  };
}

// ─── Auto-Config Logic ───────────────────────────────────────────────────────

/**
 * Automatically compute the best training configuration for the given hardware,
 * model, and dataset. This is the main "safety layer."
 */
export function computeAutoConfig(
  hw: HardwareInfo,
  model: ModelInfo,
  dataset: DatasetMeta,
): AutoConfigResult {
  const availableVRAM_MB = getEffectiveVRAM(hw);
  const availableGB = availableVRAM_MB / 1024;

  // ── LoRA config ──
  const paramsBillions = model.parameterCount / 1e9;
  const loraRank = paramsBillions > 13 ? 8 : 16;
  const loraAlpha = loraRank * 2;
  const lora: LoraConfig = {
    rank: loraRank,
    alpha: loraAlpha,
    dropout: 0.05,
    targetModules: 'all-linear',
  };

  // ── Sequence length ──
  // Use dataset p95 if available, capped at model's max context and hardware limits
  let seqLength = 512; // safe default
  if (dataset.tokenStats.p95 > 0) {
    seqLength = Math.min(
      dataset.tokenStats.p95,
      model.maxContextLength,
      2048, // Practical cap for most consumer hardware
    );
  }
  // Round up to nearest power of 2 for efficiency
  seqLength = Math.min(
    Math.pow(2, Math.ceil(Math.log2(Math.max(seqLength, 128)))),
    model.maxContextLength,
  );

  // ── Batch size — start at 4 and reduce until it fits ──
  let batchSize = 4;
  let vramEstimate = estimateVRAM(model, { loraRank, batchSize, seqLength });

  while (batchSize > 1 && vramEstimate.totalGB > availableGB * 0.85) {
    batchSize = Math.max(1, Math.floor(batchSize / 2));
    vramEstimate = estimateVRAM(model, { loraRank, batchSize, seqLength });
  }

  // If batch=1 still doesn't fit, try reducing sequence length
  if (vramEstimate.totalGB > availableGB * 0.85 && seqLength > 256) {
    seqLength = Math.max(256, Math.floor(seqLength / 2));
    vramEstimate = estimateVRAM(model, { loraRank, batchSize, seqLength });
  }

  // ── Gradient accumulation — target effective batch size of ~16-32 ──
  const targetEffective = paramsBillions > 7 ? 16 : 32;
  const gradientAccumulationSteps = Math.max(1, Math.round(targetEffective / batchSize));
  const effectiveBatchSize = batchSize * gradientAccumulationSteps;

  // ── Epochs & steps ──
  const rowCount = dataset.rowCount;
  let epochs: number;
  if (rowCount < 500) epochs = 5;
  else if (rowCount < 5000) epochs = 3;
  else if (rowCount < 50000) epochs = 2;
  else epochs = 1;

  const stepsPerEpoch = Math.ceil(rowCount / effectiveBatchSize);
  const totalSteps = stepsPerEpoch * epochs;

  // ── Learning rate ──
  const learningRate = 2e-4;
  const warmupRatio = 0.03;

  // ── Training params ──
  const training: TrainingParams = {
    batchSize,
    gradientAccumulationSteps: gradientAccumulationSteps,
    effectiveBatchSize,
    learningRate,
    epochs,
    warmupRatio,
    maxSteps: -1, // auto from epochs
    saveStepsRatio: 0.1, // checkpoint every 10%
    gradientCheckpointing: true,
    use8BitOptimizer: true,
  };

  // ── Time estimate ──
  const speedTier = getSpeedTier(hw);
  const totalTokens = dataset.tokenStats.totalTokens > 0
    ? dataset.tokenStats.totalTokens * epochs
    : rowCount * seqLength * epochs; // fallback estimate

  const lowMinutes = totalTokens / speedTier.high / 60;
  const highMinutes = totalTokens / speedTier.low / 60;
  const timeEstimate: TimeEstimate = {
    lowMinutes: Math.max(1, Math.round(lowMinutes)),
    highMinutes: Math.max(2, Math.round(highMinutes)),
  };

  // ── Fit check ──
  const fits = vramEstimate.totalGB <= availableGB * 0.85;
  let fitFailureReason: string | undefined;
  if (!fits) {
    fitFailureReason =
      `This model needs ~${formatGB(vramEstimate.totalGB)} but your hardware only has ` +
      `~${formatGB(availableGB)} available. Even with the smallest viable configuration ` +
      `(batch size 1, sequence length ${seqLength}), it won't fit.\n\n` +
      'Options:\n' +
      '  • Try a smaller model (look for models with fewer parameters)\n' +
      '  • Use a machine with more VRAM/memory\n' +
      '  • Use a cloud GPU service';
  }

  return {
    lora,
    training,
    seqLength,
    totalSteps,
    vramEstimate,
    timeEstimate,
    availableMemoryGB: Math.round(availableGB * 10) / 10,
    fits,
    fitFailureReason,
  };
}

/**
 * Recompute auto-config with user overrides.
 * Keeps the same model/dataset but updates the specified parameters.
 */
export function recomputeWithOverrides(
  hw: HardwareInfo,
  model: ModelInfo,
  dataset: DatasetMeta,
  overrides: {
    loraRank?: number;
    batchSize?: number;
    seqLength?: number;
    learningRate?: number;
    epochs?: number;
  },
): AutoConfigResult {
  const base = computeAutoConfig(hw, model, dataset);

  // Apply overrides
  if (overrides.loraRank !== undefined) {
    base.lora.rank = overrides.loraRank;
    base.lora.alpha = overrides.loraRank * 2;
  }
  if (overrides.batchSize !== undefined) {
    base.training.batchSize = overrides.batchSize;
    const targetEffective = model.parameterCount / 1e9 > 7 ? 16 : 32;
    base.training.gradientAccumulationSteps = Math.max(1, Math.round(targetEffective / overrides.batchSize));
    base.training.effectiveBatchSize = overrides.batchSize * base.training.gradientAccumulationSteps;
  }
  if (overrides.seqLength !== undefined) {
    base.seqLength = overrides.seqLength;
  }
  if (overrides.learningRate !== undefined) {
    base.training.learningRate = overrides.learningRate;
  }
  if (overrides.epochs !== undefined) {
    base.training.epochs = overrides.epochs;
  }

  // Recompute dependent values
  const stepsPerEpoch = Math.ceil(dataset.rowCount / base.training.effectiveBatchSize);
  base.totalSteps = stepsPerEpoch * base.training.epochs;

  // Recompute VRAM estimate
  base.vramEstimate = estimateVRAM(model, {
    loraRank: base.lora.rank,
    batchSize: base.training.batchSize,
    seqLength: base.seqLength,
  });

  const availableGB = getEffectiveVRAM(hw) / 1024;
  base.fits = base.vramEstimate.totalGB <= availableGB * 0.85;
  if (!base.fits) {
    base.fitFailureReason =
      `Estimated memory usage (~${formatGB(base.vramEstimate.totalGB)}) ` +
      `exceeds available memory (~${formatGB(availableGB)}).`;
  } else {
    base.fitFailureReason = undefined;
  }

  // Recompute time
  const speedTier = getSpeedTier(hw);
  const totalTokens = dataset.tokenStats.totalTokens > 0
    ? dataset.tokenStats.totalTokens * base.training.epochs
    : dataset.rowCount * base.seqLength * base.training.epochs;
  base.timeEstimate = {
    lowMinutes: Math.max(1, Math.round(totalTokens / speedTier.high / 60)),
    highMinutes: Math.max(2, Math.round(totalTokens / speedTier.low / 60)),
  };

  return base;
}
