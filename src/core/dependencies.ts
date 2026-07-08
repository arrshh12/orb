/**
 * Dependency management module for Loom.
 * Handles Python detection, venv creation, pip installs, and llama.cpp tools.
 * All installs are silent with progress indicators — no raw pip output.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { join } from 'node:path';

import type { BackendType } from '../types/hardware.js';
import {
  getVenvDir,
  getVenvPython,
  getLoomDir,
  ensureDir,
  getDepsVersion,
  writeDepsVersion,
  getDiskFreeMB,
} from '../utils/fs.js';
import { PlainLanguageError } from '../utils/errors.js';

const exec = promisify(execFile);

/** Current dependency version stamp — bump to force re-install */
const DEPS_VERSION = '0.1.0';

/** Minimum required disk space in MB for dependency installation */
const MIN_DISK_SPACE_MB = 5000; // ~5GB for PyTorch + libraries

// ─── Status Callbacks ────────────────────────────────────────────────────────

export interface DependencyCallbacks {
  onStatus: (message: string) => void;
  onProgress: (step: number, total: number, message: string) => void;
  onWarning: (message: string) => void;
}

// ─── Python Detection ────────────────────────────────────────────────────────

/**
 * Find a suitable Python 3.10+ installation on the system.
 */
export async function findSystemPython(): Promise<{ path: string; version: string } | null> {
  const isWin = platform() === 'win32';
  const candidates = isWin
    ? [
        join(process.env.USERPROFILE ?? '', '.airllm-tui/.venv/Scripts/python.exe'),
        join(process.env.USERPROFILE ?? '', 'AppData/Local/Programs/Python/Python312/python.exe'),
        'python',
        'python3',
        'py'
      ]
    : ['python3', 'python'];

  for (const cmd of candidates) {
    try {
      const args = cmd === 'py' ? ['-3', '--version'] : ['--version'];
      const { stdout } = await exec(cmd, args, { timeout: 10_000 });
      const match = /Python (\d+)\.(\d+)\.(\d+)/i.exec(stdout);
      if (match) {
        const major = parseInt(match[1]!, 10);
        const minor = parseInt(match[2]!, 10);
        if (major === 3 && minor >= 10) {
          // Get the executable path
          const pathArgs = cmd === 'py'
            ? ['-3', '-c', 'import sys; print(sys.executable)']
            : ['-c', 'import sys; print(sys.executable)'];
          const { stdout: pathOut } = await exec(cmd, pathArgs, { timeout: 10_000 });
          return {
            path: pathOut.trim(),
            version: `${match[1]}.${match[2]}.${match[3]}`,
          };
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

// ─── Venv Management ─────────────────────────────────────────────────────────

/**
 * Check if the Loom venv exists and has the right Python version.
 */
async function venvExists(): Promise<boolean> {
  const pythonPath = getVenvPython();
  return existsSync(pythonPath);
}

/**
 * Create the Loom venv using the system Python.
 */
async function createVenv(systemPythonPath: string, callbacks: DependencyCallbacks): Promise<void> {
  const venvDir = getVenvDir();
  await ensureDir(getLoomDir());

  callbacks.onStatus('Creating isolated Python environment...');

  try {
    await exec(systemPythonPath, ['-m', 'venv', '--system-site-packages', venvDir], {
      timeout: 120_000,
    });
  } catch (error) {
    throw new PlainLanguageError({
      userMessage: 'Failed to create Python environment.',
      guidance:
        'Make sure Python 3.10+ is installed and the "venv" module is available.\n' +
        'On Ubuntu/Debian, you may need: sudo apt install python3-venv',
      technicalDetail: error instanceof Error ? error.message : String(error),
    });
  }

  // Verify it was created
  if (!existsSync(getVenvPython())) {
    throw new PlainLanguageError({
      userMessage: 'Python environment was created but the Python executable is missing.',
      guidance: 'Try deleting ~/.loom/venv/ and running Loom again.',
    });
  }
}

// ─── Pip Install ─────────────────────────────────────────────────────────────

/**
 * Run pip install for a set of packages, silently.
 */
async function pipInstall(
  packages: string[],
  _callbacks: DependencyCallbacks,
  extraArgs?: string[],
): Promise<void> {
  const pythonPath = getVenvPython();
  const args = [
    '-m',
    'pip',
    'install',
    '--quiet',
    '--disable-pip-version-check',
    ...packages,
    ...(extraArgs ?? []),
  ];

  try {
    await exec(pythonPath, args, {
      timeout: 600_000, // 10 minutes max for large packages like PyTorch
      env: {
        ...process.env,
        PIP_DISABLE_PIP_VERSION_CHECK: '1',
        PIP_NO_WARN_SCRIPT_LOCATION: '1',
      },
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for pip output
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    if (/no space left|ENOSPC/i.test(msg)) {
      throw new PlainLanguageError({
        userMessage: 'Ran out of disk space while installing dependencies.',
        guidance: 'Free up at least 5 GB of disk space and try again.',
      });
    }

    if (/network|connection|timeout|ECONNREFUSED|ENOTFOUND/i.test(msg)) {
      throw new PlainLanguageError({
        userMessage: 'Couldn\'t download dependencies — network error.',
        guidance: 'Please check your internet connection and try again.',
      });
    }

    throw new PlainLanguageError({
      userMessage: 'Failed to install Python dependencies.',
      guidance:
        'Try deleting the ~/.loom/venv/ directory and running Loom again.\n' +
        'If this keeps happening, run with --debug for more details.',
      technicalDetail: msg,
    });
  }
}

// ─── Backend-Specific Install ────────────────────────────────────────────────

async function installCudaDeps(callbacks: DependencyCallbacks): Promise<void> {
  let hasTorch = false;
  try {
    await exec(getVenvPython(), ['-c', 'import torch, torchvision'], { timeout: 15_000 });
    hasTorch = true;
    callbacks.onProgress(2, 5, 'PyTorch is already installed. Skipping download.');
  } catch {
    hasTorch = false;
  }

  if (!hasTorch) {
    callbacks.onProgress(2, 5, 'Installing PyTorch (this may take a few minutes)...');
    // Install PyTorch with CUDA 12.x support
    await pipInstall(
      ['torch', 'torchvision'],
      callbacks,
      ['--index-url', 'https://download.pytorch.org/whl/cu124'],
    );
  }

  callbacks.onProgress(3, 5, 'Installing training libraries...');

  await pipInstall([
    'transformers>=5.10.1',
    'peft>=0.19.0',
    'bitsandbytes>=0.49.2',
    'accelerate>=1.2.0',
    'datasets>=3.0.0',
    'sentencepiece>=0.2.0',
    'protobuf>=4.25.0',
  ], callbacks);

  callbacks.onProgress(4, 5, 'Installing export tools...');

  await pipInstall([
    'safetensors>=0.4.0',
    'huggingface_hub>=0.25.0',
    'gguf',
  ], callbacks);
}

async function installMlxDeps(callbacks: DependencyCallbacks): Promise<void> {
  callbacks.onProgress(2, 5, 'Installing MLX libraries...');

  await pipInstall([
    'mlx>=0.20.0',
    'mlx-lm>=0.22.0',
  ], callbacks);

  callbacks.onProgress(3, 5, 'Installing support libraries...');

  await pipInstall([
    'safetensors>=0.4.0',
    'huggingface_hub>=0.25.0',
    'sentencepiece>=0.2.0',
    'gguf',
  ], callbacks);
}

// ─── llama.cpp Tools ─────────────────────────────────────────────────────────

async function installLlamaCppTools(callbacks: DependencyCallbacks): Promise<void> {
  callbacks.onProgress(5, 5, 'Setting up model export tools...');

  try {
    // Try llama-cpp-pydist first — pip-installable llama.cpp tools
    await pipInstall(['llama-cpp-pydist'], callbacks);
  } catch {
    // Fallback: the convert script is also available via the gguf package
    callbacks.onWarning(
      'Could not install llama-cpp-pydist. GGUF export will use built-in conversion tools.',
    );
  }
}

// ─── Main Setup Function ─────────────────────────────────────────────────────

/**
 * Check if dependencies are already set up and current.
 */
export async function areDependenciesReady(): Promise<boolean> {
  if (!await venvExists()) return false;
  const currentVersion = await getDepsVersion();
  return currentVersion === DEPS_VERSION;
}

/**
 * Set up all Loom dependencies. This is the main entry point.
 * Should only need to run once (or when DEPS_VERSION is bumped).
 */
export async function setupDependencies(
  backend: BackendType,
  callbacks: DependencyCallbacks,
): Promise<void> {
  // Check if already set up
  if (await areDependenciesReady()) {
    return;
  }

  // Check disk space
  const diskFree = await getDiskFreeMB(getLoomDir());
  if (diskFree >= 0 && diskFree < MIN_DISK_SPACE_MB) {
    throw new PlainLanguageError({
      userMessage: `Not enough disk space to set up Loom (need ~5 GB, have ${Math.round(diskFree / 1024 * 10) / 10} GB).`,
      guidance: 'Free up some disk space and try again.',
    });
  }

  // Find system Python
  callbacks.onProgress(0, 5, 'Finding Python...');
  const python = await findSystemPython();
  if (!python) {
    throw new PlainLanguageError({
      userMessage: 'Python 3.10 or newer is required but was not found.',
      guidance:
        platform() === 'win32'
          ? 'Download Python from https://www.python.org/downloads/\n' +
            'Make sure to check "Add python.exe to PATH" during installation.'
          : platform() === 'darwin'
            ? 'Install Python using Homebrew: brew install python@3.11'
            : 'Install Python using your package manager:\n' +
              '  Ubuntu/Debian: sudo apt install python3.11 python3.11-venv\n' +
              '  Fedora: sudo dnf install python3.11',
    });
  }

  // Create venv
  callbacks.onProgress(1, 5, 'Creating isolated environment...');
  if (!await venvExists()) {
    await createVenv(python.path, callbacks);
  }

  // Upgrade pip first
  try {
    await exec(getVenvPython(), ['-m', 'pip', 'install', '--upgrade', 'pip', '--quiet'], {
      timeout: 120_000,
    });
  } catch {
    // Non-fatal — continue with existing pip
  }

  // Install backend-specific dependencies
  if (backend === 'cuda') {
    await installCudaDeps(callbacks);
  } else if (backend === 'mlx') {
    await installMlxDeps(callbacks);
  }

  // Install llama.cpp tools
  await installLlamaCppTools(callbacks);

  // Validate bitsandbytes on CUDA path
  if (backend === 'cuda') {
    try {
      await exec(getVenvPython(), ['-m', 'bitsandbytes'], { timeout: 30_000 });
    } catch {
      callbacks.onWarning(
        'bitsandbytes validation returned a warning. Training should still work, ' +
        'but if you encounter issues, try updating your NVIDIA drivers.',
      );
    }
  }

  // Write version stamp
  await writeDepsVersion(DEPS_VERSION);
}

/**
 * Get info about the Loom venv Python for diagnostics.
 */
export async function getVenvInfo(): Promise<{
  pythonPath: string;
  pythonVersion: string;
  packages: string[];
} | null> {
  const pythonPath = getVenvPython();
  if (!existsSync(pythonPath)) return null;

  try {
    const { stdout: versionOut } = await exec(pythonPath, ['--version'], { timeout: 10_000 });
    const { stdout: listOut } = await exec(
      join(getVenvDir(), platform() === 'win32' ? 'Scripts/pip.exe' : 'bin/pip'),
      ['list', '--format=columns'],
      { timeout: 30_000 },
    );

    const packages = listOut.trim().split('\n').slice(2).map((l) => l.trim().split(/\s+/)[0]!);
    return {
      pythonPath,
      pythonVersion: versionOut.trim(),
      packages,
    };
  } catch {
    return null;
  }
}
