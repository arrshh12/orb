/**
 * Training configuration types for Loom.
 * Auto-config output and user-adjustable settings.
 */

/** LoRA adapter configuration */
export interface LoraConfig {
  rank: number;
  alpha: number;
  dropout: number;
  targetModules: string;  // "all-linear" or comma-separated list
}

/** Training hyperparameters */
export interface TrainingParams {
  batchSize: number;
  gradientAccumulationSteps: number;
  effectiveBatchSize: number;
  learningRate: number;
  epochs: number;
  warmupRatio: number;
  maxSteps: number;  // -1 for auto from epochs
  saveStepsRatio: number;  // checkpoint every N% of total steps
  gradientCheckpointing: boolean;
  use8BitOptimizer: boolean;
}

/** VRAM/memory usage estimate breakdown */
export interface VRAMEstimate {
  modelGB: number;
  loraGB: number;
  optimizerGB: number;
  gradientsGB: number;
  activationGB: number;
  overheadGB: number;
  totalGB: number;
}

/** Time estimate as a range */
export interface TimeEstimate {
  lowMinutes: number;
  highMinutes: number;
}

/** Complete auto-config result shown to the user */
export interface AutoConfigResult {
  lora: LoraConfig;
  training: TrainingParams;
  seqLength: number;
  totalSteps: number;
  vramEstimate: VRAMEstimate;
  timeEstimate: TimeEstimate;
  /** Available VRAM/unified memory in GB */
  availableMemoryGB: number;
  /** Whether the estimated config fits in available memory */
  fits: boolean;
  /** If it doesn't fit, explanation why */
  fitFailureReason?: string;
}

/** Full config object passed to the Python engine */
export interface EngineConfig {
  backend: 'cuda' | 'mlx';
  model_id: string;
  hf_token?: string;
  dataset_path: string;
  output_dir: string;
  checkpoint_dir: string;
  resume_from?: string;
  seq_length: number;
  lora: {
    rank: number;
    alpha: number;
    dropout: number;
    target_modules: string;
  };
  training: {
    batch_size: number;
    gradient_accumulation_steps: number;
    learning_rate: number;
    epochs: number;
    warmup_ratio: number;
    max_steps: number;
    save_steps_ratio: number;
    gradient_checkpointing: boolean;
    use_8bit_optimizer: boolean;
  };
  merge: boolean;
  merge_output_path: string;
  export: {
    enabled: boolean;
    quant_type: string;
    gguf_output_path: string;
  };
}

/** A saved training run for resume functionality */
export interface TrainingRun {
  id: string;
  modelId: string;
  datasetPath: string;
  startedAt: string;
  lastCheckpointStep: number;
  totalSteps: number;
  config: EngineConfig;
  completed: boolean;
}
