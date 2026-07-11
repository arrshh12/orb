import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, Newline } from 'ink';
import { ProgressBar } from './ui/ProgressBar.js';
import { Spinner } from './ui/Spinner.js';
import { INK, glyph } from '../utils/colors.js';

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
  if (m > 0) return `${m} min ${s} sec`;
  return `${s} sec`;
}

function formatEtaMinutes(seconds: number): number {
  return seconds / 60;
}

function getLossTrend(current: number, initial: number): { arrow: string; color: string } {
  if (current < initial * 0.95) return { arrow: '↓', color: INK.primary };
  if (current > initial * 1.05) return { arrow: '↑', color: INK.error };
  return { arrow: '→', color: INK.gold };
}

// ─── Main Component ──────────────────────────────────────────────────────────

/**
 * Live training progress dashboard.
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
  const startTime = useRef(Date.now());

  // Track elapsed time
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startTime.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const lossTrend = initialLoss != null && progress != null
    ? getLossTrend(progress.loss, initialLoss)
    : { arrow: '', color: INK.dim };

  const isRunning = progress != null && progress.step > 0;

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box marginX={1} marginBottom={0}>
        <Text bold color={INK.text}>TRAINING </Text>
        <Text bold color={INK.primary}>{modelId}</Text>
      </Box>

      {/* Progress bar */}
      <Box marginX={1} marginBottom={0}>
        <ProgressBar
          current={progress?.step ?? 0}
          total={totalSteps}
          etaMinutes={progress && progress.etaSeconds > 0 ? formatEtaMinutes(progress.etaSeconds) : undefined}
        />
      </Box>

      {/* Stats */}
      <Box flexDirection="column" marginX={2} marginTop={1}>
        {!isRunning ? (
          <Box marginTop={1}>
            <Spinner message={stage || 'Initializing...'} />
          </Box>
        ) : (
          <>
            <Text>
              <Text color={INK.dim}>{'Loss:     '}</Text>
              <Text color="white" bold>{progress!.loss.toFixed(4)}</Text>
              {' '}
              <Text color={lossTrend.color}>{lossTrend.arrow}</Text>
              {initialLoss != null && (
                <Text color={INK.dim}>{`  (started: ${initialLoss.toFixed(2)})`}</Text>
              )}
            </Text>

            <Text>
              <Text color={INK.dim}>{'Speed:    '}</Text>
              <Text color="white" bold>{Math.round(progress!.tokensPerSec)}</Text>
              <Text color={INK.dim}>{' tokens/sec'}</Text>
            </Text>

            <Text>
              <Text color={INK.dim}>{'Elapsed:  '}</Text>
              <Text color="white">{formatDuration(elapsedSec)}</Text>
            </Text>

            <Text>
              <Text color={INK.dim}>{'ETA:      '}</Text>
              <Text color={INK.gold}>
                {progress!.etaSeconds > 0
                  ? `~${formatDuration(progress!.etaSeconds)} remaining`
                  : 'calculating...'}
              </Text>
            </Text>

            {progress!.lr != null && (
              <Text>
                <Text color={INK.dim}>{'LR:       '}</Text>
                <Text color="white">{progress!.lr!.toExponential(2)}</Text>
              </Text>
            )}

            {stage && stage !== 'Initializing...' && (
              <Text>
                <Text color={INK.dim}>{'Stage:    '}</Text>
                <Text color={INK.primary}>{stage}</Text>
              </Text>
            )}

            <Newline />
            <Text>
              <Text color={INK.dim}>{'Last checkpoint: '}</Text>
              {lastCheckpoint != null ? (
                <Text color={INK.primary} bold>{lastCheckpoint}{` ${glyph.success}`}</Text>
              ) : (
                <Text color={INK.dim}>{'none yet'}</Text>
              )}
            </Text>
          </>
        )}
      </Box>
    </Box>
  );
}
