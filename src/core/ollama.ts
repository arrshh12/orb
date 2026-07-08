/**
 * Ollama integration module for Orb.
 * Generates Modelfiles and imports models into Ollama.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';

import type { ModelInfo } from '../types/model.js';
import { ensureDir } from '../utils/fs.js';

const exec = promisify(execFile);

// ─── Chat Template Detection ─────────────────────────────────────────────────

/** Common chat templates by architecture for Ollama Modelfile TEMPLATE field */
const CHAT_TEMPLATES: Record<string, string> = {
  LlamaForCausalLM: `{{ if .System }}<|start_header_id|>system<|end_header_id|>

{{ .System }}<|eot_id|>{{ end }}{{ if .Prompt }}<|start_header_id|>user<|end_header_id|>

{{ .Prompt }}<|eot_id|>{{ end }}<|start_header_id|>assistant<|end_header_id|>

{{ .Response }}<|eot_id|>`,

  MistralForCausalLM: `[INST] {{ if .System }}{{ .System }}

{{ end }}{{ .Prompt }} [/INST] {{ .Response }}</s>`,

  GemmaForCausalLM: `<start_of_turn>user
{{ if .System }}{{ .System }}

{{ end }}{{ .Prompt }}<end_of_turn>
<start_of_turn>model
{{ .Response }}<end_of_turn>`,

  Gemma2ForCausalLM: `<start_of_turn>user
{{ if .System }}{{ .System }}

{{ end }}{{ .Prompt }}<end_of_turn>
<start_of_turn>model
{{ .Response }}<end_of_turn>`,

  Phi3ForCausalLM: `{{ if .System }}<|system|>
{{ .System }}<|end|>
{{ end }}<|user|>
{{ .Prompt }}<|end|>
<|assistant|>
{{ .Response }}<|end|>`,

  Qwen2ForCausalLM: `{{ if .System }}<|im_start|>system
{{ .System }}<|im_end|>
{{ end }}<|im_start|>user
{{ .Prompt }}<|im_end|>
<|im_start|>assistant
{{ .Response }}<|im_end|>`,
};

/** Stop tokens by architecture */
const STOP_TOKENS: Record<string, string[]> = {
  LlamaForCausalLM: ['<|eot_id|>', '<|start_header_id|>'],
  MistralForCausalLM: ['</s>', '[INST]'],
  GemmaForCausalLM: ['<end_of_turn>'],
  Gemma2ForCausalLM: ['<end_of_turn>'],
  Phi3ForCausalLM: ['<|end|>', '<|endoftext|>'],
  Qwen2ForCausalLM: ['<|im_end|>', '<|endoftext|>'],
};

// ─── Modelfile Generation ────────────────────────────────────────────────────

/**
 * Generate an Ollama Modelfile for a fine-tuned GGUF model.
 */
export function generateModelfile(
  ggufPath: string,
  model: ModelInfo,
  options?: {
    systemPrompt?: string;
    contextLength?: number;
    temperature?: number;
  },
): string {
  const lines: string[] = [];

  // FROM — the GGUF file
  lines.push(`FROM ${ggufPath}`);
  lines.push('');

  // TEMPLATE — use the architecture-specific template
  const template = CHAT_TEMPLATES[model.architecture];
  if (template) {
    lines.push(`TEMPLATE """${template}"""`);
    lines.push('');
  }

  // SYSTEM prompt
  const systemPrompt = options?.systemPrompt ?? 'You are a helpful assistant.';
  lines.push(`SYSTEM "${systemPrompt}"`);
  lines.push('');

  // Parameters
  const ctxLen = options?.contextLength ?? Math.min(model.maxContextLength, 4096);
  const temp = options?.temperature ?? 0.7;

  lines.push(`PARAMETER temperature ${temp}`);
  lines.push(`PARAMETER num_ctx ${ctxLen}`);
  lines.push('PARAMETER top_p 0.9');
  lines.push('PARAMETER repeat_penalty 1.1');

  // Stop tokens
  const stops = STOP_TOKENS[model.architecture] ?? model.stopTokens;
  for (const stop of stops) {
    lines.push(`PARAMETER stop "${stop}"`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Write a Modelfile to disk alongside the GGUF.
 */
export async function writeModelfile(
  outputDir: string,
  ggufPath: string,
  model: ModelInfo,
  options?: {
    systemPrompt?: string;
    contextLength?: number;
    temperature?: number;
  },
): Promise<string> {
  await ensureDir(outputDir);
  const modelfilePath = join(outputDir, 'Modelfile');
  const content = generateModelfile(ggufPath, model, options);
  await writeFile(modelfilePath, content, 'utf-8');
  return modelfilePath;
}

// ─── Ollama Import ───────────────────────────────────────────────────────────

/**
 * Check if Ollama CLI is available.
 */
export async function isOllamaInstalled(): Promise<boolean> {
  try {
    await exec('ollama', ['--version'], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Import a model into Ollama using `ollama create`.
 * 
 * @param modelName - The name to give the model in Ollama
 * @param modelfilePath - Path to the Modelfile
 * @returns Whether the import succeeded
 */
export async function importToOllama(
  modelName: string,
  modelfilePath: string,
): Promise<{ success: boolean; error?: string }> {
  if (!await isOllamaInstalled()) {
    return {
      success: false,
      error:
        'Ollama is not installed. Install it from https://ollama.com\n' +
        'Then run:\n' +
        `  ollama create ${modelName} -f ${modelfilePath}`,
    };
  }

  try {
    await exec('ollama', ['create', modelName, '-f', modelfilePath], {
      timeout: 300_000, // 5 minutes — large models take time to import
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        'Failed to import into Ollama. You can try manually:\n' +
        `  ollama create ${modelName} -f ${modelfilePath}`,
    };
  }
}

/**
 * Generate a clean model name from a HuggingFace model ID and dataset.
 * E.g., "meta-llama/Llama-3.2-1B" + "recipes.csv" → "llama-3.2-1b-recipes"
 */
export function generateModelName(modelId: string, datasetPath?: string): string {
  // Take the model name part (after the /)
  const modelPart = modelId.split('/').pop() ?? modelId;
  let name = modelPart.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');

  // Add dataset hint if available
  if (datasetPath) {
    const datasetName = basename(datasetPath).replace(/\.[^.]+$/, '');
    const safeDataset = datasetName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    if (safeDataset.length > 0 && safeDataset.length < 20) {
      name = `${name}-${safeDataset}`;
    }
  }

  // Trim to reasonable length
  return name.slice(0, 50).replace(/-+$/, '');
}
