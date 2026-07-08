/**
 * Model ID validation module for Loom.
 * Validates any HuggingFace model ID, checks architecture support,
 * estimates parameter count, and handles gated models.
 */

import type { ModelInfo, ModelValidationResult } from '../types/model.js';
import { SUPPORTED_ARCHITECTURES } from '../types/model.js';
import { PlainLanguageError } from '../utils/errors.js';

// ─── HuggingFace API Interaction ─────────────────────────────────────────────

interface HFModelResponse {
  id: string;
  gated: boolean | string;
  config?: {
    architectures?: string[];
    model_type?: string;
    hidden_size?: number;
    num_hidden_layers?: number;
    num_attention_heads?: number;
    vocab_size?: number;
    max_position_embeddings?: number;
    torch_dtype?: string;
  };
  safetensors?: {
    parameters?: Record<string, number>;
    total?: number;
  };
  siblings?: Array<{ rfilename: string }>;
}

/**
 * Fetch model metadata from the HuggingFace API.
 */
async function fetchModelInfo(modelId: string, hfToken?: string): Promise<HFModelResponse> {
  const url = `https://huggingface.co/api/models/${encodeURIComponent(modelId)}`;
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  if (hfToken) {
    headers['Authorization'] = `Bearer ${hfToken}`;
  }

  let response: Response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    throw new PlainLanguageError({
      userMessage: 'Could not connect to Hugging Face.',
      guidance: 'Please check your internet connection and try again.',
      technicalDetail: error instanceof Error ? error.message : String(error),
    });
  }

  if (response.status === 401 || response.status === 403) {
    throw new PlainLanguageError({
      userMessage: `Access to model "${modelId}" is restricted.`,
      guidance:
        'This model requires you to:\n' +
        '  1. Accept the model\'s license at https://huggingface.co/' + modelId + '\n' +
        '  2. Provide a Hugging Face access token\n' +
        '  Get your token at: https://huggingface.co/settings/tokens',
      recoverable: true,
    });
  }

  if (response.status === 404) {
    throw new PlainLanguageError({
      userMessage: `Model "${modelId}" was not found on Hugging Face.`,
      guidance:
        'Check the model ID — it should look like "organization/model-name".\n' +
        'Examples: "meta-llama/Llama-3.2-1B", "mistralai/Mistral-7B-v0.1"',
    });
  }

  if (!response.ok) {
    throw new PlainLanguageError({
      userMessage: `Hugging Face returned an error (HTTP ${response.status}).`,
      guidance: 'This might be a temporary issue. Try again in a few minutes.',
      technicalDetail: await response.text(),
    });
  }

  return response.json() as Promise<HFModelResponse>;
}

/**
 * Fetch the model's config.json directly (sometimes more detailed than the API).
 */
async function fetchModelConfig(modelId: string, hfToken?: string): Promise<Record<string, unknown> | null> {
  const url = `https://huggingface.co/${encodeURIComponent(modelId)}/resolve/main/config.json`;
  const headers: Record<string, string> = {};
  if (hfToken) {
    headers['Authorization'] = `Bearer ${hfToken}`;
  }

  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return null;
    return response.json() as Promise<Record<string, unknown>>;
  } catch {
    return null;
  }
}

// ─── Parameter Count Estimation ──────────────────────────────────────────────

/**
 * Estimate parameter count from model config if safetensors metadata isn't available.
 */
function estimateParamCount(config: Record<string, unknown>): number {
  const hidden = (config.hidden_size ?? config.d_model ?? 4096) as number;
  const layers = (config.num_hidden_layers ?? config.n_layer ?? 32) as number;
  const vocab = (config.vocab_size ?? 32000) as number;
  const intermediate = (config.intermediate_size ?? hidden * 4) as number;

  // Rough formula for a transformer:
  // Embedding: vocab * hidden
  // Per layer: 4 * hidden^2 (attention) + 2 * hidden * intermediate (MLP) + layer norms
  // LM head: vocab * hidden (often tied with embedding)
  const embedding = vocab * hidden;
  const perLayer = 4 * hidden * hidden + 2 * hidden * intermediate + 2 * hidden;
  const lmHead = vocab * hidden;

  return embedding + layers * perLayer + lmHead;
}

// ─── Chat Template Detection ─────────────────────────────────────────────────

/** Common stop tokens by architecture */
const STOP_TOKENS: Record<string, string[]> = {
  LlamaForCausalLM: ['<|eot_id|>', '<|end_of_text|>'],
  MistralForCausalLM: ['</s>', '[/INST]'],
  GemmaForCausalLM: ['<end_of_turn>'],
  Gemma2ForCausalLM: ['<end_of_turn>'],
  Phi3ForCausalLM: ['<|end|>', '<|endoftext|>'],
  PhiForCausalLM: ['<|endoftext|>'],
  Qwen2ForCausalLM: ['<|im_end|>', '<|endoftext|>'],
  GPTNeoXForCausalLM: ['<|endoftext|>'],
  FalconForCausalLM: ['<|endoftext|>'],
};

// ─── Main Validation Function ────────────────────────────────────────────────

/**
 * Validate a HuggingFace model ID and return detailed model information.
 * This is the main entry point for model validation.
 */
export async function validateModel(
  modelId: string,
  hfToken?: string,
): Promise<ModelValidationResult> {
  // Normalize the model ID
  const normalizedId = modelId.trim();
  if (!normalizedId.includes('/')) {
    return {
      valid: false,
      error:
        'Model ID should include the organization name, like "meta-llama/Llama-3.2-1B".\n' +
        'You entered: "' + normalizedId + '"',
    };
  }

  try {
    // Fetch model metadata from HF API
    const hfModel = await fetchModelInfo(normalizedId, hfToken);

    // Check if it's gated and we don't have a token
    const isGated = hfModel.gated === true || hfModel.gated === 'auto' || hfModel.gated === 'manual';
    if (isGated && !hfToken) {
      return {
        valid: false,
        needsToken: true,
        error:
          `Model "${normalizedId}" is gated and requires a Hugging Face token.\n` +
          'You may also need to accept the model license at:\n' +
          `  https://huggingface.co/${normalizedId}`,
      };
    }

    // Get architecture from config
    let architecture = 'Unknown';
    let config: Record<string, any> = hfModel.config ?? {};

    // Try fetching config.json directly for more details
    const directConfig = await fetchModelConfig(normalizedId, hfToken);
    if (directConfig) {
      config = { ...config, ...directConfig };
    }

    const architectures = (config.architectures as string[] | undefined) ?? [];
    architecture = architectures[0] ?? (config.model_type as string | undefined) ?? 'Unknown';

    // Check architecture support
    const isSupported = SUPPORTED_ARCHITECTURES.includes(architecture as never);
    if (!isSupported) {
      return {
        valid: false,
        error:
          `Model "${normalizedId}" uses architecture "${architecture}", which Loom doesn't support yet.\n\n` +
          'Loom supports these architectures:\n' +
          SUPPORTED_ARCHITECTURES.map((a) => `  • ${a}`).join('\n') + '\n\n' +
          'This is usually because the model is not a text-generation (causal LM) model,\n' +
          'or it uses a very new architecture that hasn\'t been added to Loom yet.',
      };
    }

    // Estimate parameter count
    let parameterCount = 0;
    if (hfModel.safetensors?.total) {
      parameterCount = hfModel.safetensors.total;
    } else if (hfModel.safetensors?.parameters) {
      parameterCount = Object.values(hfModel.safetensors.parameters).reduce((a, b) => a + b, 0);
    } else {
      parameterCount = estimateParamCount(config as Record<string, unknown>);
    }

    // Extract model dimensions
    const hiddenSize = (config.hidden_size ?? config.d_model ?? 4096) as number;
    const numLayers = (config.num_hidden_layers ?? config.n_layer ?? 32) as number;
    const numAttentionHeads = (config.num_attention_heads ?? config.n_head ?? 32) as number;
    const vocabSize = (config.vocab_size ?? 32000) as number;
    const maxContextLength = (config.max_position_embeddings ?? config.max_sequence_length ?? 2048) as number;
    const dtype = config.torch_dtype as string | undefined;

    // Get chat template
    const chatTemplate = config.chat_template as string | undefined;

    // Get stop tokens
    const stopTokens = STOP_TOKENS[architecture] ?? ['</s>'];

    // Compute size estimates
    const estimatedSizeFP16GB = (parameterCount * 2) / (1024 ** 3); // fp16 = 2 bytes/param
    const estimated4BitGB = (parameterCount * 0.5) / (1024 ** 3);   // 4-bit = 0.5 bytes/param

    const model: ModelInfo = {
      id: normalizedId,
      architecture,
      isSupported,
      parameterCount,
      estimatedSizeFP16GB,
      estimated4BitGB,
      isGated,
      chatTemplate,
      stopTokens,
      vocabSize,
      hiddenSize,
      numLayers,
      numAttentionHeads,
      maxContextLength,
      dtype,
    };

    return { valid: true, model };
  } catch (error) {
    if (error instanceof PlainLanguageError) {
      if (error.recoverable) {
        return {
          valid: false,
          needsToken: true,
          error: error.userMessage + '\n' + error.guidance,
        };
      }
      return { valid: false, error: error.userMessage + '\n' + error.guidance };
    }
    return {
      valid: false,
      error: 'Failed to validate model: ' + (error instanceof Error ? error.message : String(error)),
    };
  }
}

/**
 * Quick check if a model will fit in the available VRAM (rough estimate).
 * Returns a human-readable message about fit.
 */
export function quickFitCheck(model: ModelInfo, availableVRAMMB: number): {
  fits: boolean;
  message: string;
} {
  const availableGB = availableVRAMMB / 1024;
  const needed4BitGB = model.estimated4BitGB;

  // Add overhead estimate: ~2GB for CUDA + ~1GB for LoRA/optimizer
  const minNeededGB = needed4BitGB + 3;

  if (availableGB >= minNeededGB * 1.2) {
    return {
      fits: true,
      message: `This model will use ~${minNeededGB.toFixed(1)} GB of your ${availableGB.toFixed(1)} GB — looks good!`,
    };
  }

  if (availableGB >= minNeededGB) {
    return {
      fits: true,
      message: `This model will use ~${minNeededGB.toFixed(1)} GB of your ${availableGB.toFixed(1)} GB — it'll be tight but should work.`,
    };
  }

  return {
    fits: false,
    message:
      `This model needs ~${minNeededGB.toFixed(1)} GB but you only have ${availableGB.toFixed(1)} GB available.\n` +
      'Consider a smaller model, or Loom will try to optimize batch size and sequence length.',
  };
}
