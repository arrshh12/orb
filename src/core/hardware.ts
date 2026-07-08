/**
 * Hardware detection module for Orb.
 * Detects GPU, RAM, disk space, and selects the appropriate training backend.
 * 
 * This runs before any model is touched — it determines what the user's machine
 * can handle and feeds into auto-config and backend selection.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';

import type {
  HardwareInfo,
  HardwareSummary,
  GpuInfo,
  NvidiaGpuInfo,
  AppleSiliconInfo,
  BackendType,
} from '../types/hardware.js';
import { getDiskFreeMB } from '../utils/fs.js';
import { formatMB } from '../utils/formatting.js';

const exec = promisify(execFile);

// ─── NVIDIA GPU Detection ────────────────────────────────────────────────────

async function detectNvidiaGpu(): Promise<NvidiaGpuInfo | null> {
  try {
    const { stdout } = await exec('nvidia-smi', [
      '--query-gpu=name,memory.total,memory.free,driver_version',
      '--format=csv,noheader,nounits',
    ], { timeout: 10_000 });

    const line = stdout.trim().split('\n')[0];
    if (!line) return null;

    const parts = line.split(',').map((s) => s.trim());
    if (parts.length < 4) return null;

    const [name, totalStr, freeStr, driverVersion] = parts;

    return {
      type: 'nvidia',
      name: name!,
      vramTotalMB: parseInt(totalStr!, 10),
      vramFreeMB: parseInt(freeStr!, 10),
      driverVersion: driverVersion!,
    };
  } catch {
    // nvidia-smi not found or failed — no NVIDIA GPU
    return null;
  }
}

/** Try to detect CUDA version from nvidia-smi */
async function detectCudaVersion(): Promise<string | undefined> {
  try {
    const { stdout } = await exec('nvidia-smi', [], { timeout: 10_000 });
    const match = /CUDA Version:\s*(\d+\.\d+)/i.exec(stdout);
    return match?.[1];
  } catch {
    return undefined;
  }
}

// ─── Apple Silicon Detection ─────────────────────────────────────────────────

async function detectAppleSilicon(): Promise<AppleSiliconInfo | null> {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    return null;
  }

  try {
    // Get chip name
    let chipName = 'Apple Silicon';
    try {
      const { stdout } = await exec('sysctl', ['-n', 'machdep.cpu.brand_string'], { timeout: 5000 });
      chipName = stdout.trim() || chipName;
    } catch {
      // Fallback: try system_profiler
      try {
        const { stdout } = await exec('system_profiler', ['SPHardwareDataType'], { timeout: 10_000 });
        const match = /Chip:\s*(.+)/i.exec(stdout);
        if (match) chipName = match[1]!.trim();
      } catch {
        // Keep default
      }
    }

    // Get unified memory size
    const { stdout: memStr } = await exec('sysctl', ['-n', 'hw.memsize'], { timeout: 5000 });
    const totalBytes = parseInt(memStr.trim(), 10);
    const totalMB = Math.floor(totalBytes / (1024 * 1024));

    // Estimate free memory (macOS doesn't have a simple "free memory" command)
    const freeMB = Math.floor(os.freemem() / (1024 * 1024));

    return {
      type: 'apple-silicon',
      chipName,
      unifiedMemoryMB: totalMB,
      unifiedMemoryFreeMB: freeMB,
    };
  } catch {
    return null;
  }
}

// ─── Python Detection ────────────────────────────────────────────────────────

async function detectPython(): Promise<{ version: string; path: string } | null> {
  const candidates = process.platform === 'win32'
    ? ['python', 'python3', 'py -3']
    : ['python3', 'python'];

  for (const cmd of candidates) {
    try {
      const parts = cmd.split(' ');
      const { stdout } = await exec(parts[0]!, parts.slice(1).concat(['--version']), {
        timeout: 10_000,
      });
      const match = /Python (\d+\.\d+\.\d+)/i.exec(stdout);
      if (match) {
        const version = match[1]!;
        const [major, minor] = version.split('.').map(Number);
        if (major! >= 3 && minor! >= 10) {
          // Get the actual path
          const { stdout: pathOut } = await exec(
            parts[0]!,
            parts.slice(1).concat(['-c', 'import sys; print(sys.executable)']),
            { timeout: 10_000 }
          );
          return { version, path: pathOut.trim() };
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

// ─── Backend Selection ───────────────────────────────────────────────────────

function selectBackend(gpu: GpuInfo): BackendType {
  switch (gpu.type) {
    case 'nvidia':
      return 'cuda';
    case 'apple-silicon':
      return 'mlx';
    case 'none':
      return 'cpu-only';
  }
}

// ─── Main Detection Function ─────────────────────────────────────────────────

/**
 * Detect all hardware capabilities of the current machine.
 * This is the main entry point for hardware detection.
 */
export async function detectHardware(outputDir?: string): Promise<HardwareInfo> {
  // Detect GPU — try NVIDIA first, then Apple Silicon
  let gpu: GpuInfo;
  const nvidia = await detectNvidiaGpu();
  if (nvidia) {
    const cudaVersion = await detectCudaVersion();
    gpu = { ...nvidia, cudaVersion };
  } else {
    const apple = await detectAppleSilicon();
    gpu = apple ?? { type: 'none' };
  }

  // Detect RAM
  const ramTotalMB = Math.floor(os.totalmem() / (1024 * 1024));
  const ramFreeMB = Math.floor(os.freemem() / (1024 * 1024));

  // Detect disk space
  const diskPath = outputDir ?? os.homedir();
  const diskFreeMB = await getDiskFreeMB(diskPath);

  // Detect Python
  const python = await detectPython();

  // Select backend
  const backend = selectBackend(gpu);

  return {
    os: process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux',
    arch: process.arch === 'arm64' ? 'arm64' : 'x64',
    gpu,
    ramTotalMB,
    ramFreeMB,
    diskFreeMB,
    backend,
    pythonVersion: python?.version,
    pythonPath: python?.path,
  };
}

// ─── Hardware Summary (for display) ──────────────────────────────────────────

/**
 * Generate a human-readable summary of detected hardware.
 */
export function summarizeHardware(hw: HardwareInfo): HardwareSummary {
  let gpuLabel: string;
  let vramLabel: string;

  switch (hw.gpu.type) {
    case 'nvidia':
      gpuLabel = `NVIDIA ${hw.gpu.name} (${formatMB(hw.gpu.vramTotalMB)} VRAM)`;
      vramLabel = `${formatMB(hw.gpu.vramTotalMB)} total, ${formatMB(hw.gpu.vramFreeMB)} free`;
      break;
    case 'apple-silicon':
      gpuLabel = `${hw.gpu.chipName} (${formatMB(hw.gpu.unifiedMemoryMB)} unified)`;
      vramLabel = `${formatMB(hw.gpu.unifiedMemoryMB)} unified memory`;
      break;
    case 'none':
      gpuLabel = 'No dedicated GPU detected';
      vramLabel = 'N/A';
      break;
  }

  const ramLabel = `${formatMB(hw.ramTotalMB)} total, ${formatMB(hw.ramFreeMB)} free`;
  const diskLabel = hw.diskFreeMB >= 0 ? `${formatMB(hw.diskFreeMB)} free` : 'Unknown';

  const backendLabels: Record<BackendType, string> = {
    cuda: 'CUDA (NVIDIA GPU)',
    mlx: 'MLX (Apple Silicon)',
    'cpu-only': 'CPU only — not supported for training',
  };
  const backendLabel = backendLabels[hw.backend];

  const viable = hw.backend !== 'cpu-only';
  let refusalReason: string | undefined;
  if (!viable) {
    refusalReason =
      'Orb requires a dedicated GPU (NVIDIA with CUDA or Apple Silicon M-series) ' +
      'to fine-tune models. Training on CPU alone would take an unreasonable amount ' +
      'of time (30+ hours for even a small model) and is not supported.\n\n' +
      'Options:\n' +
      '  • Use a machine with an NVIDIA GPU or an Apple Silicon Mac\n' +
      '  • Use a cloud GPU service (Google Colab, Lambda Labs, RunPod)\n';
  }

  return {
    gpuLabel,
    vramLabel,
    ramLabel,
    diskLabel,
    backendLabel,
    viable,
    refusalReason,
  };
}

/**
 * Get the effective VRAM in MB for memory calculations.
 * For NVIDIA: GPU VRAM. For Apple Silicon: unified memory (with a conservative cap).
 */
export function getEffectiveVRAM(hw: HardwareInfo): number {
  switch (hw.gpu.type) {
    case 'nvidia':
      return hw.gpu.vramTotalMB;
    case 'apple-silicon':
      // Apple Silicon can use all unified memory, but we should be conservative
      // to leave room for the OS and other apps. Use 75% of total.
      return Math.floor(hw.gpu.unifiedMemoryMB * 0.75);
    case 'none':
      return 0;
  }
}
