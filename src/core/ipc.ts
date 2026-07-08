/**
 * IPC (Inter-Process Communication) manager for Loom.
 * Spawns the Python training engine as a subprocess and communicates
 * via JSON Lines over stdio.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  IPCMessageSchema,
  type IPCCallbacks,
  type IPCMessage,
} from '../types/ipc.js';
import type { EngineConfig } from '../types/config.js';
import { ensureDir, getVenvPython, getLoomDir } from '../utils/fs.js';
import { PlainLanguageError } from '../utils/errors.js';

// ─── Engine Path Resolution ──────────────────────────────────────────────────

/** Resolve the path to the engine package directory */
function getEnginePath(): string {
  // The engine/ directory is at the project root, sibling to src/
  const thisFile = fileURLToPath(import.meta.url);
  const srcDir = dirname(dirname(thisFile)); // up from core/ to src/
  const projectRoot = dirname(srcDir);       // up from src/ to project root
  return join(projectRoot, 'engine');
}

// ─── IPC Manager ─────────────────────────────────────────────────────────────

export interface TrainingProcess {
  /** The underlying child process */
  child: ChildProcess;
  /** Send a kill signal to the process */
  kill: () => void;
  /** Promise that resolves when the process exits */
  exited: Promise<number | null>;
}

/**
 * Spawn the Python training engine and set up JSON Lines IPC.
 * 
 * @param config - The engine configuration to pass to Python
 * @param callbacks - Handlers for each IPC message type
 * @param options - Additional spawn options
 * @returns A TrainingProcess handle
 */
export async function spawnTrainingEngine(
  config: EngineConfig,
  callbacks: IPCCallbacks,
  options?: {
    /** Use system Python instead of Loom's venv */
    useSystemPython?: boolean;
    /** Enable debug mode (don't suppress stderr) */
    debug?: boolean;
  },
): Promise<TrainingProcess> {
  // Write config to a temp JSON file
  const configDir = join(getLoomDir(), 'tmp');
  await ensureDir(configDir);
  const configPath = join(configDir, `config_${Date.now()}.json`);
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

  // Determine Python executable
  const pythonPath = options?.useSystemPython
    ? 'python3'
    : getVenvPython();

  // Determine engine path
  const enginePath = getEnginePath();

  // Set up log file for stderr
  const logDir = join(getLoomDir(), 'logs');
  await ensureDir(logDir);
  const logPath = join(logDir, `training_${Date.now()}.log`);

  // Spawn the Python process
  let child: ChildProcess;
  try {
    child = spawn(pythonPath, [
      '-u',  // Unbuffered output — critical for real-time IPC
      '-m', 'engine',
      '--config', configPath,
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: dirname(enginePath), // Run from project root so `python -m engine` works
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        // HF token if provided
        ...(config.hf_token ? { HF_TOKEN: config.hf_token } : {}),
      },
    });
  } catch (error) {
    throw new PlainLanguageError({
      userMessage: 'Failed to start the training engine.',
      guidance:
        'Make sure Python is installed and Loom\'s dependencies are set up.\n' +
        'Try running "loom" again — it will attempt to set up dependencies automatically.',
      technicalDetail: error instanceof Error ? error.message : String(error),
    });
  }

  // ── Read stdout line-by-line as JSON Lines ──
  const rl = createInterface({ input: child.stdout! });
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const raw = JSON.parse(trimmed);
      const result = IPCMessageSchema.safeParse(raw);

      if (!result.success) {
        // Valid JSON but doesn't match our schema — log it
        callbacks.onUnparseable(trimmed);
        return;
      }

      const msg: IPCMessage = result.data;

      // Route to the appropriate callback
      switch (msg.type) {
        case 'stage':
          callbacks.onStage(msg);
          break;
        case 'progress':
          callbacks.onProgress(msg);
          break;
        case 'checkpoint':
          callbacks.onCheckpoint(msg);
          break;
        case 'log':
          callbacks.onLog(msg);
          break;
        case 'error':
          callbacks.onError(msg);
          break;
        case 'done':
          callbacks.onDone(msg);
          break;
        case 'export_progress':
          callbacks.onExportProgress(msg);
          break;
      }
    } catch {
      // Not valid JSON — likely a stray print statement
      callbacks.onUnparseable(trimmed);
    }
  });

  // ── Capture stderr ──
  const stderrChunks: Buffer[] = [];
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrChunks.push(chunk);
    if (options?.debug) {
      process.stderr.write(chunk);
    }
  });

  // ── Handle process exit ──
  const exited = new Promise<number | null>((resolve) => {
    child.on('close', (code, signal) => {
      if (stderrChunks.length > 0) {
        writeFile(logPath, Buffer.concat(stderrChunks)).catch(() => {});
      }
      callbacks.onExit(code, signal?.toString() ?? null);
      resolve(code);
    });

    child.on('error', (error) => {
      callbacks.onError({
        type: 'error',
        message: 'Training engine process failed to start.',
        detail: error.message,
        recoverable: false,
      });
      resolve(1);
    });
  });

  return {
    child,
    kill: () => {
      try {
        child.kill('SIGTERM');
        // Give it 5 seconds to save checkpoint, then force kill
        setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {
            // Already exited
          }
        }, 5000);
      } catch {
        // Already exited
      }
    },
    exited,
  };
}

/**
 * Create a no-op callbacks object (useful for testing or when you only care about some events).
 */
export function createDefaultCallbacks(
  overrides?: Partial<IPCCallbacks>,
): IPCCallbacks {
  return {
    onStage: overrides?.onStage ?? (() => {}),
    onProgress: overrides?.onProgress ?? (() => {}),
    onCheckpoint: overrides?.onCheckpoint ?? (() => {}),
    onLog: overrides?.onLog ?? (() => {}),
    onError: overrides?.onError ?? (() => {}),
    onDone: overrides?.onDone ?? (() => {}),
    onExportProgress: overrides?.onExportProgress ?? (() => {}),
    onExit: overrides?.onExit ?? (() => {}),
    onUnparseable: overrides?.onUnparseable ?? (() => {}),
  };
}
