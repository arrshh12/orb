import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { INK, glyph } from '../../utils/colors.js';

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
 * Orbital Terminal progress bar.
 * Block-style [████░░░░] per the Stitch design spec.
 * Neon purple filled blocks, faint shade for empty, gold ETA.
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
  const percentNum = Math.round(percent * 100);
  const percentStr = `${percentNum}%`;
  const stepStr = `${current}/${total}`;
  const etaStr = etaMinutes != null ? formatEta(etaMinutes) : '';

  // Calculate bar width: subtract label + percentage + step count + brackets
  const labelLen = label ? label.length + 1 : 0;
  const suffixLen = ` ${percentStr} [${stepStr}]${etaStr ? `  ETA: ${etaStr}` : ''}`.length;
  const barWidth = Math.max(10, Math.min(40, termWidth - labelLen - suffixLen - 6));

  const filled = Math.round(percent * barWidth);
  const empty = barWidth - filled;
  const filledStr = glyph.block.repeat(filled);
  const emptyStr = glyph.shade.repeat(empty);

  return (
    <Box flexDirection="column">
      {label && (
        <Box marginBottom={0}>
          <Text color={INK.faint}>{glyph.prompt} </Text>
          <Text color={INK.primary} bold>{label}</Text>
        </Box>
      )}
      <Box>
        <Text color={INK.secondary}>{'['}</Text>
        <Text color={INK.primary} bold>{filledStr}</Text>
        <Text color={INK.faint}>{emptyStr}</Text>
        <Text color={INK.secondary}>{']'}</Text>
        <Text>
          {'  '}
          <Text bold color="white">{percentStr}</Text>
          {'  '}
          <Text color={INK.faint}>{`[${stepStr}]`}</Text>
          {etaStr && (
            <>
              {'  '}
              <Text color={INK.gold}>{'ETA: '}</Text>
              <Text color={INK.primary} bold>{etaStr}</Text>
            </>
          )}
        </Text>
      </Box>
    </Box>
  );
}
