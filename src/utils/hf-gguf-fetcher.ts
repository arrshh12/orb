import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { getOrbDir, ensureDir } from './fs.js';

/**
 * Searches the Hugging Face Hub for a GGUF model and downloads it.
 * Prefers Q4_K_M quantizations if multiple exist in the repository.
 * 
 * @param modelRepo The Hugging Face repo (e.g. "TheBloke/Llama-2-7B-Chat-GGUF")
 * @param onProgress Callback for download progress
 * @returns Path to the downloaded .gguf file
 */
export async function fetchBaseGgufModel(
  modelRepo: string,
  onProgress?: (downloadedBytes: number, totalBytes: number) => void
): Promise<string> {
  const modelsDir = path.join(getOrbDir(), 'models');
  await ensureDir(modelsDir);
  
  // Safely name the target directory
  const safeRepoName = modelRepo.replace(/\//g, '--');
  const targetDir = path.join(modelsDir, safeRepoName);
  await ensureDir(targetDir);

  // 1. Fetch repo info from HF API
  const apiUrl = `https://huggingface.co/api/models/${modelRepo}/tree/main`;
  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch model info from Hugging Face: ${response.statusText}. Ensure this is a valid GGUF repository.`);
  }

  const files: { path: string; size: number }[] = await response.json();
  const ggufFiles = files.filter(f => f.path.endsWith('.gguf'));

  if (ggufFiles.length === 0) {
    throw new Error(`No .gguf files found in repository ${modelRepo}.`);
  }

  // 2. Select the best GGUF file (prefer Q4_K_M, otherwise take the first one)
  let selectedFile = ggufFiles.find(f => f.path.toLowerCase().includes('q4_k_m'));
  if (!selectedFile) {
    selectedFile = ggufFiles[0];
  }

  if (!selectedFile) {
     throw new Error('Unexpected error selecting GGUF file.');
  }

  const targetGgufPath = path.join(targetDir, selectedFile.path);

  // 3. Check if we already have it
  if (existsSync(targetGgufPath)) {
    const stats = await fs.stat(targetGgufPath);
    if (stats.size === selectedFile.size) {
      // File exists and size matches
      return targetGgufPath;
    }
  }

  // 4. Download the file
  const downloadUrl = `https://huggingface.co/${modelRepo}/resolve/main/${selectedFile.path}?download=true`;
  const downloadRes = await fetch(downloadUrl);
  
  if (!downloadRes.ok || !downloadRes.body) {
    throw new Error(`Failed to download GGUF file: ${downloadRes.statusText}`);
  }

  const totalBytes = selectedFile.size;
  let downloadedBytes = 0;

  // Use a write stream to save memory during download
  const { createWriteStream } = await import('node:fs');
  const { Readable } = await import('node:stream');
  const { finished } = await import('node:stream/promises');
  
  const dest = createWriteStream(targetGgufPath);
  
  // Web Streams to Node Streams wrapper
  // @ts-ignore
  const nodeReadable = Readable.fromWeb(downloadRes.body);
  
  nodeReadable.on('data', (chunk) => {
    downloadedBytes += chunk.length;
    if (onProgress) {
      onProgress(downloadedBytes, totalBytes);
    }
  });

  nodeReadable.pipe(dest);
  await finished(dest);

  return targetGgufPath;
}
