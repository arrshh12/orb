import React from 'react';
import { Box, Text } from 'ink';
import type { HardwareInfo } from '../../types/hardware.js';

interface HardwareTableProps {
  hardware: HardwareInfo;
}

/** Format megabytes to a human-readable string with 1 decimal */
function formatMB(mb: number): string {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${mb} MB`;
}

/** Derive a GPU label from hardware info */
function getGpuLabel(hardware: HardwareInfo): string {
  const { gpu } = hardware;
  if (gpu.type === 'nvidia') {
    return `${gpu.name} (${formatMB(gpu.vramTotalMB)} VRAM)`;
  }
  if (gpu.type === 'apple-silicon') {
    return `${gpu.chipName} (${formatMB(gpu.unifiedMemoryMB)} unified)`;
  }
  return 'None detected';
}

/** Derive a VRAM/memory label */
function getVramLabel(hardware: HardwareInfo): string {
  const { gpu } = hardware;
  if (gpu.type === 'nvidia') {
    return `${formatMB(gpu.vramFreeMB)} free / ${formatMB(gpu.vramTotalMB)} total`;
  }
  if (gpu.type === 'apple-silicon') {
    return `${formatMB(gpu.unifiedMemoryFreeMB)} free / ${formatMB(gpu.unifiedMemoryMB)} total`;
  }
  return 'N/A';
}

/** Derive a backend label */
function getBackendLabel(hardware: HardwareInfo): string {
  switch (hardware.backend) {
    case 'cuda':     return 'CUDA (NVIDIA GPU)';
    case 'mlx':      return 'MLX (Apple Silicon)';
    case 'cpu-only': return 'CPU only (no GPU)';
  }
}

const LABEL_WIDTH = 14;
const SEPARATOR = '─'.repeat(45);

function Row({ label, value, valueColor }: {
  label: string;
  value: string;
  valueColor?: string;
}): React.ReactElement {
  return (
    <Box>
      <Text color="gray">{`  ${label.padEnd(LABEL_WIDTH)}`}</Text>
      <Text color={valueColor ?? 'white'}>{value}</Text>
    </Box>
  );
}

/**
 * Displays detected hardware in a formatted table.
 *
 *   Hardware Profile
 *   ─────────────────────────────────────────
 *   GPU:          NVIDIA RTX 4070 (12 GB VRAM)
 *   VRAM:         10.2 GB free / 12 GB total
 *   RAM:          32 GB (18.4 GB free)
 *   Disk:         142 GB free
 *   Backend:      CUDA (NVIDIA GPU)
 *   ─────────────────────────────────────────
 */
export function HardwareTable({ hardware }: HardwareTableProps): React.ReactElement {
  const gpuColor = hardware.gpu.type === 'none' ? 'red' : 'green';
  const backendColor = hardware.backend === 'cpu-only' ? 'yellow' : 'cyan';

  return (
    <Box flexDirection="column" marginX={1} marginBottom={1}>
      <Text bold color="cyan">  Hardware Profile</Text>
      <Text color="gray">{`  ${SEPARATOR}`}</Text>

      <Row label="GPU:" value={getGpuLabel(hardware)} valueColor={gpuColor} />
      {hardware.gpu.type !== 'none' && (
        <Row label="VRAM:" value={getVramLabel(hardware)} />
      )}
      <Row
        label="RAM:"
        value={`${formatMB(hardware.ramTotalMB)} (${formatMB(hardware.ramFreeMB)} free)`}
      />
      <Row label="Disk:" value={`${formatMB(hardware.diskFreeMB)} free`} />
      <Row label="Backend:" value={getBackendLabel(hardware)} valueColor={backendColor} />
      {hardware.pythonVersion && (
        <Row label="Python:" value={hardware.pythonVersion} valueColor="gray" />
      )}

      <Text color="gray">{`  ${SEPARATOR}`}</Text>
    </Box>
  );
}
