import React from 'react';
import { Box, Text } from 'ink';
import { Spinner } from './ui/Spinner.js';
import { INK, glyph } from '../utils/colors.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExportStage {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'complete' | 'error';
  errorMessage?: string;
}

interface ExportStepProps {
  stages: ExportStage[];
  currentStage: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StageIcon({ status }: { status: ExportStage['status'] }): React.ReactElement {
  switch (status) {
    case 'complete':
      return <Text color={INK.primary} bold>{`${glyph.success} `}</Text>;
    case 'active':
      return <Spinner message="" />;
    case 'error':
      return <Text color={INK.error} bold>{`${glyph.error} `}</Text>;
    case 'pending':
    default:
      return <Text color={INK.dim}>{`${glyph.pending} `}</Text>;
  }
}

function stageColor(status: ExportStage['status']): string {
  switch (status) {
    case 'complete': return INK.primary;
    case 'active':   return INK.gold;
    case 'error':    return INK.error;
    case 'pending':
    default:         return INK.dim;
  }
}

// ─── Main Component ──────────────────────────────────────────────────────────

/**
 * GGUF export progress display with stage checklist.
 *
 *   EXPORT                        [ACTIVE]
 *
 *   ✓ Merging adapter into base model
 *   ✓ Converting to GGUF format
 *   ◐ Quantizing (Q4_K_M)...
 *   ○ Importing to Ollama
 */
export function ExportStep({ stages, currentStage: _currentStage }: ExportStepProps): React.ReactElement {
  const hasError = stages.some(s => s.status === 'error');
  const allDone = stages.every(s => s.status === 'complete');

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box marginX={1} marginBottom={1}>
        <Text color={INK.text} bold>{'EXPORT'}</Text>
        {hasError && (
          <Text color={INK.error} bold>{'  [ERROR]'}</Text>
        )}
        {allDone && (
          <Text color={INK.primary} bold>{'  [COMPLETE]'}</Text>
        )}
      </Box>

      {/* Stage list */}
      <Box flexDirection="column" marginX={2}>
        {stages.map(stage => (
          <Box key={stage.id} marginBottom={0}>
            <StageIcon status={stage.status} />
            <Text color={stageColor(stage.status)}>
              {stage.status === 'active' ? `${stage.label}` : stage.label}
            </Text>
            {stage.status === 'active' && (
              <Text color={INK.dim}>{'...'}</Text>
            )}
          </Box>
        ))}
      </Box>

      {/* Error detail */}
      {hasError && (
        <Box marginX={2} marginTop={1}>
          {stages
            .filter(s => s.status === 'error' && s.errorMessage)
            .map(s => (
              <Box key={s.id} flexDirection="column">
                <Text color={INK.error}>{'  Error: '}{s.errorMessage}</Text>
              </Box>
            ))}
        </Box>
      )}

      {/* Completion message */}
      {allDone && (
        <Box marginX={2} marginTop={1}>
          <Text color={INK.primary} bold>{`${glyph.success} `}</Text>
          <Text color={INK.primary}>[COMPLETE] All export stages finished.</Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * Creates the default export stages for the typical GGUF export pipeline.
 */
export function createDefaultExportStages(): ExportStage[] {
  return [
    { id: 'merge',     label: 'Merging adapter into base model',  status: 'pending' },
    { id: 'convert',   label: 'Converting to GGUF format',        status: 'pending' },
    { id: 'quantize',  label: 'Quantizing (Q4_K_M)',              status: 'pending' },
    { id: 'import',    label: 'Importing to Ollama',              status: 'pending' },
  ];
}
