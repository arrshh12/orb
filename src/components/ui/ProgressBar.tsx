import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { ProgressBar as InkProgressBar } from '@inkjs/ui';
import { INK } from '../../utils/colors.js';

interface ProgressBarProps {
  /** Current step / count */
  current: number;
  /** Total steps / count */
  total: number;
  /** Optional label displayed before the bar */
  label?: string;
  /** Estimated time remaining in minutes */
  etaMinutes?: number;
}

function formatEta(minutes: number): string {
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `~${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `~${h}h ${m}m` : `~${h}h`;
}

/**
 * Training progress bar.
 * Primary cyan label, white percentage, dim step count, gold ETA.
 */
export function ProgressBar({
  current,
  total,
  label,
  etaMinutes,
}: ProgressBarProps): React.ReactElement {
  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 80;

  const percent = total > 0 ? Math.min(current / total, 1) : 0;
  const percentStr = `${Math.round(percent * 100)}%`;
  const stepStr = `(${current}/${total})`;
  const etaStr = etaMinutes != null ? `ETA: ${formatEta(etaMinutes)}` : '';

  const labelLen = label ? label.length + 1 : 0;
  const suffixLen = ` ${percentStr} ${stepStr}${etaStr ? `  ${etaStr}` : ''}`.length;
  const barWidth = Math.max(10, termWidth - labelLen - suffixLen - 6);

  return (
    <Box>
      {label && <Text color={INK.primary} bold>{label} </Text>}
      <Box width={barWidth}>
        <InkProgressBar value={percent} />
      </Box>
      <Text>
        {' '}
        <Text bold color="white">{percentStr}</Text>
        {' '}
        <Text color={INK.dim}>{stepStr}</Text>
        {etaStr && (
          <>
            {'  '}
            <Text color={INK.gold}>{etaStr}</Text>
          </>
        )}
      </Text>
    </Box>
  );
}
