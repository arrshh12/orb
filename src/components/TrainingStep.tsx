import React, { useState, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import { ProgressBar } from './ui/ProgressBar.js';
import { Spinner } from './ui/Spinner.js';
import { INK, glyph } from '../utils/colors.js';
import { useFrameCycle } from '../utils/useFrameCycle.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TrainingStepProps {
  modelId: string;
  totalSteps: number;
  progress: TrainingProgress | null;
  stage: string;
  lastCheckpoint: string | null;
  initialLoss: number | null;
}

interface TrainingProgress {
  step: number;
  loss: number;
  tokensPerSec: number;
  etaSeconds: number;
  lr?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatEtaMinutes(seconds: number): number {
  return seconds / 60;
}

function getLossTrend(current: number, initial: number): { arrow: string; color: string } {
  if (current < initial * 0.95) return { arrow: glyph.down + ' IMPROVING', color: INK.tertiary };
  if (current > initial * 1.05) return { arrow: glyph.up + ' DIVERGING', color: INK.error };
  return { arrow: glyph.arrow + ' STABLE', color: INK.gold };
}

// ─── Mini Chart ──────────────────────────────────────────────────────────────

/** Renders a compact sparkline for loss trend using block characters. */
function LossSparkline({ losses }: { losses: number[] }): React.ReactElement | null {
  if (losses.length < 2) return null;
  const min = Math.min(...losses);
  const max = Math.max(...losses);
  const range = max - min || 1;
  const bars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

  const sparkStr = losses
    .slice(-16)
    .map((v) => bars[Math.floor(((v - min) / range) * (bars.length - 1))])
    .join('');

  return (
    <Box>
      <Text color={INK.faint}>{'  loss curve: '}</Text>
      <Text color={INK.primary}>{sparkStr}</Text>
    </Box>
  );
}

// ─── Status Chip ──────────────────────────────────────────────────────────────

function StatusChip({ label, value, valueColor }: { label: string; value: string; valueColor?: string }): React.ReactElement {
  return (
    <Box marginRight={2}>
      <Text color={INK.faint}>{label}</Text>
      <Text color={valueColor ?? INK.text} bold>{value}</Text>
    </Box>
  );
}

// ─── Blinking cursor for activity indicator ───────────────────────────────────

function BlinkCursor(): React.ReactElement {
  const frames = ['█', ' '];
  const frame = useFrameCycle(frames, 500, false);
  return <Text color={INK.primary}>{frame}</Text>;
}

// ─── Main Component ──────────────────────────────────────────────────────────

/**
 * Orbital Terminal live training dashboard.
 * Block progress bar, loss sparkline, metrics grid, checkpoint log.
 */
export function TrainingStep({
  modelId,
  totalSteps,
  progress,
  stage,
  lastCheckpoint,
  initialLoss,
}: TrainingStepProps): React.ReactElement {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [lossHistory, setLossHistory] = useState<number[]>([]);
  const startTime = useRef(Date.now());

  // Track elapsed time
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startTime.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Track loss history for sparkline
  useEffect(() => {
    if (progress?.loss != null && progress.loss > 0) {
      setLossHistory((prev) => [...prev.slice(-32), progress.loss]);
    }
  }, [progress?.step]);

  const lossTrend = initialLoss != null && progress != null
    ? getLossTrend(progress.loss, initialLoss)
    : { arrow: '', color: INK.faint };

  const isRunning = progress != null && progress.step > 0;

  return (
    <Box flexDirection="column" marginX={1}>
      {/* ── Panel Header ──────────────────────────────────────────────── */}
      <Box
        borderStyle="single"
        borderColor={INK.primary}
        paddingX={2}
        paddingY={0}
        flexDirection="column"
      >
        {/* Title bar */}
        <Box justifyContent="space-between">
          <Box>
            <Text color={INK.primary} bold>{'TRAINING PROGRESS'}</Text>
            <Text color={INK.faint}>{'  │  '}</Text>
            <Text color={INK.secondary}>{modelId}</Text>
          </Box>
          <Box>
            {isRunning ? (
              <Box>
                <Text color={INK.tertiary} bold>{'● ACTIVE  '}</Text>
                <BlinkCursor />
              </Box>
            ) : (
              <Text color={INK.faint}>{'○ LOADING'}</Text>
            )}
          </Box>
        </Box>

        <Text color={INK.faint}>{glyph.separator.repeat(60)}</Text>

        {/* ── Progress bar ──────────────────────────────────────────────── */}
        <Box marginY={0}>
          <ProgressBar
            current={progress?.step ?? 0}
            total={totalSteps}
            label="STEP"
            etaMinutes={
              progress && progress.etaSeconds > 0
                ? formatEtaMinutes(progress.etaSeconds)
                : undefined
            }
          />
        </Box>

        {/* ── Live metrics ─────────────────────────────────────────────── */}
        {!isRunning ? (
          <Box marginTop={1}>
            <Spinner message={stage || 'Initializing training engine...'} />
          </Box>
        ) : (
          <>
            <Text color={INK.faint}>{glyph.separator.repeat(60)}</Text>

            {/* Metrics row */}
            <Box flexWrap="wrap" marginTop={0}>
              <StatusChip
                label={'  LOSS      '}
                value={progress!.loss.toFixed(4)}
                valueColor="white"
              />
              <StatusChip
                label={'  TREND     '}
                value={lossTrend.arrow}
                valueColor={lossTrend.color}
              />
              {initialLoss != null && (
                <StatusChip
                  label={'  INIT LOSS '}
                  value={initialLoss.toFixed(4)}
                  valueColor={INK.faint}
                />
              )}
            </Box>

            <Box flexWrap="wrap">
              <StatusChip
                label={'  SPEED     '}
                value={`${Math.round(progress!.tokensPerSec)} tok/s`}
                valueColor={INK.text}
              />
              <StatusChip
                label={'  ELAPSED   '}
                value={formatDuration(elapsedSec)}
                valueColor={INK.text}
              />
              {progress!.lr != null && (
                <StatusChip
                  label={'  LR        '}
                  value={progress!.lr!.toExponential(2)}
                  valueColor={INK.secondary}
                />
              )}
            </Box>

            {/* Loss sparkline */}
            <LossSparkline losses={lossHistory} />

            {/* Stage */}
            {stage && stage !== 'Initializing...' && (
              <Box marginTop={0}>
                <Text color={INK.faint}>{'  STAGE     '}</Text>
                <Text color={INK.primary}>{stage}</Text>
              </Box>
            )}
          </>
        )}
      </Box>

      {/* ── Checkpoint log ──────────────────────────────────────────────── */}
      <Box
        borderStyle="single"
        borderColor={INK.secondary}
        paddingX={2}
        paddingY={0}
        marginTop={1}
      >
        <Text color={INK.faint}>{'CHECKPOINT  '}</Text>
        {lastCheckpoint != null ? (
          <>
            <Text color={INK.tertiary} bold>{`${glyph.check} `}</Text>
            <Text color={INK.text}>{lastCheckpoint}</Text>
          </>
        ) : (
          <Text color={INK.faint}>{'─ none yet ─'}</Text>
        )}
      </Box>
    </Box>
  );
}
