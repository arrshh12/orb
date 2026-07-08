/**
 * Filesystem utilities for Loom.
 * Handles disk space checks, temp dirs, path resolution, and Loom's data directory.
 */

import { statfs, mkdir, stat, readdir, rm } from 'node:fs/promises';
import { homedir, tmpdir, platform } from 'node:os';
import { join, resolve, isAbsolute } from 'node:path';
import { existsSync } from 'node:fs';

/** Get the Loom data directory (~/.loom on Unix, %USERPROFILE%\.loom on Windows) */
export function getLoomDir(): string {
  return join(homedir(), '.loom');
}

/** Get the Loom venv directory */
export function getVenvDir(): string {
  const airllmVenv = join(homedir(), '.airllm-tui/.venv');
  if (existsSync(join(airllmVenv, 'Scripts/python.exe')) || existsSync(join(airllmVenv, 'bin/python')) || existsSync(join(airllmVenv, 'Scripts/python')) || existsSync(join(airllmVenv, 'bin/python.exe'))) {
    return airllmVenv;
  }
  return join(getLoomDir(), 'venv');
}

/** Get the Loom output directory for trained models */
export function getOutputDir(): string {
  return join(getLoomDir(), 'output');
}

/** Get the Loom runs directory for tracking training runs */
export function getRunsDir(): string {
  return join(getLoomDir(), 'runs');
}

/** Get the Loom cache directory for downloaded models */
export function getCacheDir(): string {
  return join(getLoomDir(), 'cache');
}

/** Get the llama.cpp tools directory */
export function getLlamaCppDir(): string {
  return join(getLoomDir(), 'llama-cpp');
}

/** Get a temporary directory for Loom operations */
export function getTempDir(): string {
  return join(tmpdir(), 'loom-tmp');
}

/** Get the Python executable path inside the Loom venv */
export function getVenvPython(): string {
  const venv = getVenvDir();
  if (platform() === 'win32') {
    return join(venv, 'Scripts', 'python.exe');
  }
  return join(venv, 'bin', 'python');
}

/** Get the pip executable path inside the Loom venv */
export function getVenvPip(): string {
  const venv = getVenvDir();
  if (platform() === 'win32') {
    return join(venv, 'Scripts', 'pip.exe');
  }
  return join(venv, 'bin', 'pip');
}

/** Ensure a directory exists (recursive mkdir) */
export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

/** Get free disk space in MB at a given path */
export async function getDiskFreeMB(dirPath: string): Promise<number> {
  try {
    // Ensure the directory exists for statfs to work
    const targetPath = existsSync(dirPath) ? dirPath : homedir();
    const stats = await statfs(targetPath);
    const freeBytes = stats.bfree * stats.bsize;
    return Math.floor(freeBytes / (1024 * 1024));
  } catch {
    // Fallback: return -1 to indicate unknown
    return -1;
  }
}

/** Check if a file exists and is a regular file */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const s = await stat(filePath);
    return s.isFile();
  } catch {
    return false;
  }
}

/** Check if a directory exists */
export async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const s = await stat(dirPath);
    return s.isDirectory();
  } catch {
    return false;
  }
}

/** Get file size in bytes */
export async function getFileSize(filePath: string): Promise<number> {
  const s = await stat(filePath);
  return s.size;
}

/** Resolve a user-provided path (expand ~ and relative paths) */
export function resolvePath(inputPath: string): string {
  // Expand ~ to home directory
  let resolved = inputPath.trim();
  if (resolved.startsWith('~')) {
    resolved = join(homedir(), resolved.slice(1));
  }
  // Resolve relative paths
  if (!isAbsolute(resolved)) {
    resolved = resolve(process.cwd(), resolved);
  }
  return resolved;
}

/** 
 * Generate a unique output directory name for a training run.
 * Uses the model name and a timestamp.
 */
export function generateRunDir(modelId: string): string {
  const safeName = modelId.replace(/[/\\:]/g, '-').replace(/[^a-zA-Z0-9-_.]/g, '');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return join(getOutputDir(), `${safeName}_${timestamp}`);
}

/** List incomplete training runs (for resume functionality) */
export async function listIncompleteRuns(): Promise<string[]> {
  const runsDir = getRunsDir();
  if (!await dirExists(runsDir)) return [];
  
  const entries = await readdir(runsDir, { withFileTypes: true });
  const incomplete: string[] = [];
  
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const runPath = join(runsDir, entry.name);
      const donePath = join(runPath, '.done');
      const configPath = join(runPath, 'config.json');
      if (await fileExists(configPath) && !await fileExists(donePath)) {
        incomplete.push(runPath);
      }
    }
  }
  
  return incomplete;
}

/** Clean up temporary files */
export async function cleanupTemp(): Promise<void> {
  const tempDir = getTempDir();
  if (await dirExists(tempDir)) {
    await rm(tempDir, { recursive: true, force: true });
  }
}

/** Check the version stamp for dependency installation */
export async function getDepsVersion(): Promise<string | null> {
  const stampPath = join(getLoomDir(), '.deps-version');
  try {
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(stampPath, 'utf-8');
    return content.trim();
  } catch {
    return null;
  }
}

/** Write the version stamp after successful dependency installation */
export async function writeDepsVersion(version: string): Promise<void> {
  const stampPath = join(getLoomDir(), '.deps-version');
  await ensureDir(getLoomDir());
  const { writeFile } = await import('node:fs/promises');
  await writeFile(stampPath, version, 'utf-8');
}
