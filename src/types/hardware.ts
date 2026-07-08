/**
 * Hardware detection types for Orb.
 * Describes the user's machine capabilities to drive backend selection and auto-config.
 */

/** Supported operating systems */
export type OperatingSystem = 'windows' | 'macos' | 'linux';

/** CPU architecture */
export type Architecture = 'x64' | 'arm64';

/** GPU accelerator type */
export type GpuType = 'nvidia' | 'apple-silicon' | 'none';

/** Training backend selection */
export type BackendType = 'cuda' | 'mlx' | 'cpu-only';

/** NVIDIA GPU information parsed from nvidia-smi */
export interface NvidiaGpuInfo {
  type: 'nvidia';
  name: string;
  vramTotalMB: number;
  vramFreeMB: number;
  driverVersion: string;
  cudaVersion?: string;
  computeCapability?: string;
}

/** Apple Silicon GPU information */
export interface AppleSiliconInfo {
  type: 'apple-silicon';
  chipName: string;
  unifiedMemoryMB: number;
  unifiedMemoryFreeMB: number;
}

/** No dedicated GPU detected */
export interface NoGpuInfo {
  type: 'none';
}

/** Union of all GPU info types */
export type GpuInfo = NvidiaGpuInfo | AppleSiliconInfo | NoGpuInfo;

/** Complete hardware profile of the user's machine */
export interface HardwareInfo {
  os: OperatingSystem;
  arch: Architecture;
  gpu: GpuInfo;
  /** Total system RAM in MB */
  ramTotalMB: number;
  /** Free system RAM in MB */
  ramFreeMB: number;
  /** Free disk space in the target output directory, in MB */
  diskFreeMB: number;
  /** Automatically selected backend based on hardware */
  backend: BackendType;
  /** Python version found on the system, if any */
  pythonVersion?: string;
  /** Path to the Python executable */
  pythonPath?: string;
}

/** Human-readable hardware summary for display */
export interface HardwareSummary {
  gpuLabel: string;       // e.g., "NVIDIA RTX 4070 (12 GB)"
  vramLabel: string;      // e.g., "12 GB total, 10.2 GB free"
  ramLabel: string;       // e.g., "32 GB total, 18.4 GB free"
  diskLabel: string;      // e.g., "142 GB free"
  backendLabel: string;   // e.g., "CUDA (NVIDIA GPU)"
  viable: boolean;        // false if CPU-only
  refusalReason?: string; // why training can't proceed
}
