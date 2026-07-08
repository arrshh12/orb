import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, Newline } from 'ink';
import { ProgressBar } from './ui/ProgressBar.js';

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
  if (current < initial * 0.95) return { arrow: '↓', color: 'green' };
  if (current > initial * 1.05) return { arrow: '↑', color: 'red' };
  return { arrow: '→', color: 'yellow' };
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
    : { arrow: '', color: 'gray' };

  const isRunning = progress != null && progress.step > 0;

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box marginX={1} marginBottom={0}>
        <Text bold color="cyan">{'🏋️ Training: '}</Text>
        <Text bold>{modelId}</Text>
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
          <Box>
            <Text color="yellow">{stage || 'Initializing...'}</Text>
          </Box>
        ) : (
          <>
            <Text>
              <Text color="gray">{'Loss:     '}</Text>
              <Text color="white" bold>{progress!.loss.toFixed(4)}</Text>
              {' '}
              <Text color={lossTrend.color}>{lossTrend.arrow}</Text>
              {initialLoss != null && (
                <Text color="gray">{`  (started: ${initialLoss.toFixed(2)})`}</Text>
              )}
            </Text>

            <Text>
              <Text color="gray">{'Speed:    '}</Text>
              <Text color="white" bold>{Math.round(progress!.tokensPerSec)}</Text>
              <Text color="gray">{' tokens/sec'}</Text>
            </Text>

            <Text>
              <Text color="gray">{'Elapsed:  '}</Text>
              <Text color="white">{formatDuration(elapsedSec)}</Text>
            </Text>

            <Text>
              <Text color="gray">{'ETA:      '}</Text>
              <Text color="yellow">
                {progress!.etaSeconds > 0
                  ? `~${formatDuration(progress!.etaSeconds)} remaining`
                  : 'calculating...'}
              </Text>
            </Text>

            {progress!.lr != null && (
              <Text>
                <Text color="gray">{'LR:       '}</Text>
                <Text color="white">{progress!.lr!.toExponential(2)}</Text>
              </Text>
            )}

            {stage && stage !== 'Initializing...' && (
              <Text>
                <Text color="gray">{'Stage:    '}</Text>
                <Text color="cyan">{stage}</Text>
              </Text>
            )}

            <Newline />
            <Text>
              <Text color="gray">{'Last checkpoint: '}</Text>
              {lastCheckpoint != null ? (
                <Text color="green" bold>{lastCheckpoint}{' ✓'}</Text>
              ) : (
                <Text color="gray" dimColor>{'none yet'}</Text>
              )}
            </Text>
          </>
        )}
      </Box>
    </Box>
  );
}
