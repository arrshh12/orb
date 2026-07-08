/**
 * Unit tests for model ID validation.
 * Tests against mock HuggingFace API responses for various scenarios.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateModel, quickFitCheck } from '../../src/core/model-validator.js';
import type { ModelInfo } from '../../src/types/model.js';

// ─── Mock Fetch ──────────────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;

function mockFetch(handler: (url: string) => { status: number; body: unknown }) {
  globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString();
    const result = handler(url);
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      json: async () => result.body,
      text: async () => JSON.stringify(result.body),
    } as Response;
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ─── Mock Model Responses ────────────────────────────────────────────────────

const MOCK_LLAMA_1B = {
  id: 'meta-llama/Llama-3.2-1B',
  gated: false,
  config: {
    architectures: ['LlamaForCausalLM'],
    model_type: 'llama',
    hidden_size: 2048,
    num_hidden_layers: 22,
    num_attention_heads: 32,
    vocab_size: 128256,
    max_position_embeddings: 131072,
    torch_dtype: 'bfloat16',
  },
  safetensors: {
    total: 1100000000,
  },
};

const MOCK_GATED_MODEL = {
  id: 'meta-llama/Llama-3.1-70B',
  gated: 'auto',
  config: {
    architectures: ['LlamaForCausalLM'],
  },
};

const MOCK_VISION_MODEL = {
  id: 'openai/clip-vit-large',
  gated: false,
  config: {
    architectures: ['CLIPModel'],
    model_type: 'clip',
  },
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('validateModel', () => {
  it('should validate a supported public model', async () => {
    mockFetch((url) => {
      if (url.includes('/api/models/')) return { status: 200, body: MOCK_LLAMA_1B };
      if (url.includes('/resolve/main/config.json')) return { status: 200, body: MOCK_LLAMA_1B.config };
      return { status: 404, body: {} };
    });

    const result = await validateModel('meta-llama/Llama-3.2-1B');

    expect(result.valid).toBe(true);
    expect(result.model).toBeDefined();
    expect(result.model!.id).toBe('meta-llama/Llama-3.2-1B');
    expect(result.model!.architecture).toBe('LlamaForCausalLM');
    expect(result.model!.isSupported).toBe(true);
    expect(result.model!.parameterCount).toBe(1100000000);
    expect(result.model!.hiddenSize).toBe(2048);
    expect(result.model!.numLayers).toBe(22);
  });

  it('should reject model IDs without org prefix', async () => {
    const result = await validateModel('Llama-3.2-1B');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('organization');
  });

  it('should handle 404 (model not found)', async () => {
    mockFetch(() => ({ status: 404, body: {} }));

    const result = await validateModel('nonexistent/model-xyz');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should detect gated models and request token', async () => {
    mockFetch((url) => {
      if (url.includes('/api/models/')) return { status: 200, body: MOCK_GATED_MODEL };
      return { status: 404, body: {} };
    });

    const result = await validateModel('meta-llama/Llama-3.1-70B');

    expect(result.valid).toBe(false);
    expect(result.needsToken).toBe(true);
    expect(result.error).toContain('token');
  });

  it('should handle 403 (access denied)', async () => {
    mockFetch(() => ({ status: 403, body: {} }));

    const result = await validateModel('private/restricted-model');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('restricted');
  });

  it('should reject unsupported architectures', async () => {
    mockFetch((url) => {
      if (url.includes('/api/models/')) return { status: 200, body: MOCK_VISION_MODEL };
      if (url.includes('/resolve/main/config.json')) return { status: 200, body: MOCK_VISION_MODEL.config };
      return { status: 404, body: {} };
    });

    const result = await validateModel('openai/clip-vit-large');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('CLIPModel');
    expect(result.error).toContain('support');
  });

  it('should accept gated models when token is provided', async () => {
    mockFetch((url) => {
      if (url.includes('/api/models/')) return { status: 200, body: { ...MOCK_GATED_MODEL, config: MOCK_LLAMA_1B.config, safetensors: MOCK_LLAMA_1B.safetensors } };
      if (url.includes('/resolve/main/config.json')) return { status: 200, body: MOCK_LLAMA_1B.config };
      return { status: 404, body: {} };
    });

    const result = await validateModel('meta-llama/Llama-3.1-70B', 'hf_test_token');

    expect(result.valid).toBe(true);
  });

  it('should handle network errors gracefully', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('Network error: ENOTFOUND');
    });

    const result = await validateModel('meta-llama/Llama-3.2-1B');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('internet');
  });
});

describe('quickFitCheck', () => {
  const model: ModelInfo = {
    id: 'test/7b',
    architecture: 'LlamaForCausalLM',
    isSupported: true,
    parameterCount: 7e9,
    estimatedSizeFP16GB: 14,
    estimated4BitGB: 3.5,
    isGated: false,
    stopTokens: ['</s>'],
    vocabSize: 32000,
    hiddenSize: 4096,
    numLayers: 32,
    numAttentionHeads: 32,
    maxContextLength: 4096,
  };

  it('should pass for adequate VRAM', () => {
    const result = quickFitCheck(model, 12288); // 12GB
    expect(result.fits).toBe(true);
    expect(result.message).toContain('looks good');
  });

  it('should pass with warning for tight fit', () => {
    const result = quickFitCheck(model, 7168); // 7GB
    expect(result.fits).toBe(true);
    expect(result.message).toContain('tight');
  });

  it('should fail for insufficient VRAM', () => {
    const result = quickFitCheck(model, 4096); // 4GB
    expect(result.fits).toBe(false);
    expect(result.message).toContain('only have');
  });
});
