/**
 * Unit tests for the auto-config engine.
 * Tests VRAM estimation formulas against known reference configurations
 * and verifies parameter selection logic.
 */

import { describe, it, expect } from 'vitest';
import { estimateVRAM, computeAutoConfig } from '../../src/core/auto-config.js';
import type { ModelInfo } from '../../src/types/model.js';
import type { HardwareInfo } from '../../src/types/hardware.js';
import type { DatasetMeta } from '../../src/types/dataset.js';

// ─── Test Model Configs ──────────────────────────────────────────────────────

function makeModel(params: { paramCount: number; hidden: number; layers: number; heads: number; maxCtx?: number }): ModelInfo {
  return {
    id: 'test/model',
    architecture: 'LlamaForCausalLM',
    isSupported: true,
    parameterCount: params.paramCount,
    estimatedSizeFP16GB: (params.paramCount * 2) / (1024 ** 3),
    estimated4BitGB: (params.paramCount * 0.5) / (1024 ** 3),
    isGated: false,
    stopTokens: ['</s>'],
    vocabSize: 32000,
    hiddenSize: params.hidden,
    numLayers: params.layers,
    numAttentionHeads: params.heads,
    maxContextLength: params.maxCtx ?? 4096,
  };
}

const MODEL_1B = makeModel({ paramCount: 1.1e9, hidden: 2048, layers: 22, heads: 32 });
const MODEL_7B = makeModel({ paramCount: 7e9, hidden: 4096, layers: 32, heads: 32 });
const MODEL_13B = makeModel({ paramCount: 13e9, hidden: 5120, layers: 40, heads: 40 });
const MODEL_70B = makeModel({ paramCount: 70e9, hidden: 8192, layers: 80, heads: 64 });

function makeHW(vramMB: number, type: 'nvidia' | 'apple-silicon' = 'nvidia'): HardwareInfo {
  if (type === 'nvidia') {
    return {
      os: 'linux', arch: 'x64',
      gpu: { type: 'nvidia', name: 'Test GPU', vramTotalMB: vramMB, vramFreeMB: vramMB - 512, driverVersion: '535.0' },
      ramTotalMB: 32768, ramFreeMB: 16384, diskFreeMB: 102400, backend: 'cuda',
    };
  }
  return {
    os: 'macos', arch: 'arm64',
    gpu: { type: 'apple-silicon', chipName: 'Apple M2', unifiedMemoryMB: vramMB, unifiedMemoryFreeMB: vramMB * 0.7 },
    ramTotalMB: vramMB, ramFreeMB: vramMB * 0.7, diskFreeMB: 204800, backend: 'mlx',
  };
}

function makeDataset(rows: number): DatasetMeta {
  return {
    path: '/test/data.jsonl',
    format: 'jsonl',
    rowCount: rows,
    tokenStats: { min: 50, max: 800, mean: 200, median: 180, p95: 450, totalTokens: rows * 200 },
    normalizedPath: '/test/normalized.jsonl',
  };
}

// ─── VRAM Estimation Tests ───────────────────────────────────────────────────

describe('estimateVRAM', () => {
  it('should estimate ~2-3 GB for 1B model (batch=1, seq=512)', () => {
    const est = estimateVRAM(MODEL_1B, { batchSize: 1, seqLength: 512 });
    expect(est.totalGB).toBeGreaterThan(1.5);
    expect(est.totalGB).toBeLessThan(5);
  });

  it('should estimate ~5-10 GB for 7B model (batch=1, seq=512)', () => {
    const est = estimateVRAM(MODEL_7B, { batchSize: 1, seqLength: 512 });
    expect(est.totalGB).toBeGreaterThan(4);
    expect(est.totalGB).toBeLessThan(12);
  });

  it('should estimate ~10-16 GB for 13B model (batch=1, seq=512)', () => {
    const est = estimateVRAM(MODEL_13B, { batchSize: 1, seqLength: 512 });
    expect(est.totalGB).toBeGreaterThan(6);
    expect(est.totalGB).toBeLessThan(20);
  });

  it('should show model weights as the dominant component', () => {
    const est = estimateVRAM(MODEL_7B, { batchSize: 1, seqLength: 512 });
    expect(est.modelGB).toBeGreaterThan(est.loraGB);
    expect(est.modelGB).toBeGreaterThan(est.optimizerGB);
  });

  it('should increase with larger batch size', () => {
    const small = estimateVRAM(MODEL_7B, { batchSize: 1, seqLength: 512 });
    const large = estimateVRAM(MODEL_7B, { batchSize: 4, seqLength: 512 });
    expect(large.totalGB).toBeGreaterThan(small.totalGB);
  });

  it('should increase with longer sequence length', () => {
    const short = estimateVRAM(MODEL_7B, { batchSize: 1, seqLength: 256 });
    const long = estimateVRAM(MODEL_7B, { batchSize: 1, seqLength: 2048 });
    expect(long.totalGB).toBeGreaterThan(short.totalGB);
  });

  it('should increase with higher LoRA rank', () => {
    const low = estimateVRAM(MODEL_7B, { loraRank: 8, batchSize: 1, seqLength: 512 });
    const high = estimateVRAM(MODEL_7B, { loraRank: 64, batchSize: 1, seqLength: 512 });
    expect(high.loraGB).toBeGreaterThan(low.loraGB);
    expect(high.optimizerGB).toBeGreaterThan(low.optimizerGB);
  });
});

// ─── Auto-Config Tests ───────────────────────────────────────────────────────

describe('computeAutoConfig', () => {
  it('should produce a fitting config for 7B on 12GB GPU', () => {
    const hw = makeHW(12288);
    const config = computeAutoConfig(hw, MODEL_7B, makeDataset(1000));

    expect(config.fits).toBe(true);
    expect(config.training.batchSize).toBeGreaterThanOrEqual(1);
    expect(config.lora.rank).toBe(16);
    expect(config.seqLength).toBeGreaterThan(0);
    expect(config.totalSteps).toBeGreaterThan(0);
    expect(config.timeEstimate.lowMinutes).toBeGreaterThan(0);
    expect(config.timeEstimate.highMinutes).toBeGreaterThan(config.timeEstimate.lowMinutes);
  });

  it('should reduce batch size to fit on constrained hardware', () => {
    const hw8gb = makeHW(8192); // 8GB
    const hw24gb = makeHW(24576); // 24GB
    const config8 = computeAutoConfig(hw8gb, MODEL_7B, makeDataset(1000));
    const config24 = computeAutoConfig(hw24gb, MODEL_7B, makeDataset(1000));

    // On 8GB, batch should be <= what 24GB allows, and config must still fit
    expect(config8.training.batchSize).toBeLessThanOrEqual(config24.training.batchSize);
    expect(config8.fits).toBe(true); // 7B should still fit on 8GB at batch=1+
  });

  it('should refuse when model clearly won\'t fit', () => {
    const hw = makeHW(4096); // 4GB — too small for 7B even at 4-bit
    const config = computeAutoConfig(hw, MODEL_7B, makeDataset(1000));

    expect(config.fits).toBe(false);
    expect(config.fitFailureReason).toBeDefined();
    expect(config.fitFailureReason).toContain('smaller model');
  });

  it('should easily fit 1B model on 8GB GPU', () => {
    const hw = makeHW(8192);
    const config = computeAutoConfig(hw, MODEL_1B, makeDataset(1000));

    expect(config.fits).toBe(true);
    expect(config.training.batchSize).toBeGreaterThanOrEqual(2);
  });

  it('should use higher rank for small models', () => {
    const hw = makeHW(12288);
    const config = computeAutoConfig(hw, MODEL_1B, makeDataset(1000));

    expect(config.lora.rank).toBe(16); // ≤13B → rank 16
  });

  it('should use lower rank for large models', () => {
    const hw = makeHW(49152); // 48GB
    const config = computeAutoConfig(hw, MODEL_70B, makeDataset(1000));

    expect(config.lora.rank).toBe(8); // >13B → rank 8
  });

  it('should select more epochs for small datasets', () => {
    const hw = makeHW(12288);
    const smallData = computeAutoConfig(hw, MODEL_7B, makeDataset(100));
    const largeData = computeAutoConfig(hw, MODEL_7B, makeDataset(100000));

    expect(smallData.training.epochs).toBeGreaterThan(largeData.training.epochs);
  });

  it('should set gradient accumulation to target effective batch size', () => {
    const hw = makeHW(12288);
    const config = computeAutoConfig(hw, MODEL_7B, makeDataset(1000));

    expect(config.training.effectiveBatchSize).toBe(
      config.training.batchSize * config.training.gradientAccumulationSteps
    );
  });

  it('should cap sequence length at model max context', () => {
    const hw = makeHW(12288);
    const model = makeModel({ paramCount: 1.1e9, hidden: 2048, layers: 22, heads: 32, maxCtx: 1024 });
    const config = computeAutoConfig(hw, model, makeDataset(1000));

    expect(config.seqLength).toBeLessThanOrEqual(1024);
  });

  it('should work for Apple Silicon', () => {
    const hw = makeHW(32768, 'apple-silicon');
    const config = computeAutoConfig(hw, MODEL_7B, makeDataset(1000));

    expect(config.fits).toBe(true);
    expect(config.timeEstimate.lowMinutes).toBeGreaterThan(0);
  });

  it('should always enable gradient checkpointing', () => {
    const hw = makeHW(12288);
    const config = computeAutoConfig(hw, MODEL_7B, makeDataset(1000));

    expect(config.training.gradientCheckpointing).toBe(true);
  });

  it('should always enable 8-bit optimizer', () => {
    const hw = makeHW(12288);
    const config = computeAutoConfig(hw, MODEL_7B, makeDataset(1000));

    expect(config.training.use8BitOptimizer).toBe(true);
  });
});
