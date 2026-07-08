/**
 * Model information types for Loom.
 * Describes HuggingFace model metadata for validation and auto-config.
 */

/** Supported causal LM architectures that QLoRA can target */
export const SUPPORTED_ARCHITECTURES = [
  'LlamaForCausalLM',
  'MistralForCausalLM',
  'MixtralForCausalLM',
  'GemmaForCausalLM',
  'Gemma2ForCausalLM',
  'Phi3ForCausalLM',
  'PhiForCausalLM',
  'Qwen2ForCausalLM',
  'Qwen2MoeForCausalLM',
  'GPTNeoXForCausalLM',
  'GPT2LMHeadModel',
  'FalconForCausalLM',
  'StableLmForCausalLM',
  'StarCoder2ForCausalLM',
  'CohereForCausalLM',
  'InternLM2ForCausalLM',
  'DeepseekV2ForCausalLM',
] as const;

export type SupportedArchitecture = typeof SUPPORTED_ARCHITECTURES[number];

/** Complete model information from HuggingFace API */
export interface ModelInfo {
  /** HuggingFace model ID (e.g., "meta-llama/Llama-3.2-1B") */
  id: string;
  /** Model architecture class name */
  architecture: string;
  /** Whether the architecture is supported for QLoRA */
  isSupported: boolean;
  /** Estimated total parameter count */
  parameterCount: number;
  /** Estimated model size in GB at full precision (fp16) */
  estimatedSizeFP16GB: number;
  /** Estimated model size in GB at 4-bit quantization */
  estimated4BitGB: number;
  /** Whether the model is gated (requires acceptance/token) */
  isGated: boolean;
  /** Default chat template string, if the model has one */
  chatTemplate?: string;
  /** Model's stop/end-of-turn tokens */
  stopTokens: string[];
  /** Vocabulary size */
  vocabSize: number;
  /** Hidden dimension size */
  hiddenSize: number;
  /** Number of transformer layers */
  numLayers: number;
  /** Number of attention heads */
  numAttentionHeads: number;
  /** Maximum context length the model supports */
  maxContextLength: number;
  /** Model's dtype (e.g., "bfloat16", "float16") */
  dtype?: string;
}

/** Result of model validation */
export interface ModelValidationResult {
  valid: boolean;
  model?: ModelInfo;
  error?: string;
  /** Whether the user needs to provide an HF token */
  needsToken?: boolean;
}
