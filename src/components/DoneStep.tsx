import React from 'react';
import { Box, Text, useInput } from 'ink';
import { INK, glyph } from '../utils/colors.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DoneStepProps {
  /** Path to the exported GGUF file */
  ggufPath: string;
  /** Path to the Modelfile */
  modelfilePath: string;
  /** Name of the model (for Ollama) */
  modelName: string;
  /** Whether the model was successfully imported to Ollama */
  ollamaImported: boolean;
  /** Human-readable file size of the GGUF */
  fileSize: string;
  /** Callback to exit the application */
  onExit?: () => void;
}

// ─── Main Component ──────────────────────────────────────────────────────────

/**
 * Orbital Terminal success screen.
 * Shown after training and export are complete.
 * Terminal-green success status, sharp ASCII borders, command prompt.
 */
export function DoneStep({
  ggufPath,
  modelfilePath,
  modelName,
  ollamaImported,
  fileSize,
  onExit,
}: DoneStepProps): React.ReactElement {
  useInput(() => {
    if (onExit) {
      onExit();
    }
  });

  return (
    <Box flexDirection="column" marginX={1}>
      {/* ── Success Hero ──────────────────────────────────────────────── */}
      <Box
        borderStyle="double"
        borderColor={INK.tertiary}
        paddingX={2}
        paddingY={0}
        marginBottom={1}
      >
        <Text color={INK.tertiary} bold>
          {'★ '}
        </Text>
        <Text color={INK.tertiary} bold>
          {'MODEL READY'}
        </Text>
        <Text color={INK.faint}>{'  ──  '}</Text>
        <Text color={INK.text}>{'Training complete. Your model is ready to run.'}</Text>
      </Box>

      {/* ── Artifacts Panel ─────────────────────────────────────────── */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={INK.secondary}
        paddingX={2}
        paddingY={0}
        marginBottom={1}
      >
        <Text bold color={INK.primary}>{'OUTPUT ARTIFACTS'}</Text>
        <Text color={INK.faint}>{glyph.separator.repeat(50)}</Text>

        <Box>
          <Text color={INK.faint}>{'  GGUF       '}</Text>
          <Text color="white" bold>{ggufPath}</Text>
          {fileSize && (
            <Text color={INK.secondary}>{`  (${fileSize})`}</Text>
          )}
        </Box>

        <Box>
          <Text color={INK.faint}>{'  MODELFILE  '}</Text>
          <Text color="white">{modelfilePath}</Text>
        </Box>

        <Text color={INK.faint}>{glyph.separator.repeat(50)}</Text>

        {/* Ollama import status */}
        {ollamaImported ? (
          <Box>
            <Text color={INK.tertiary} bold>{`${glyph.check} `}</Text>
            <Text color={INK.tertiary} bold>{'IMPORTED  '}</Text>
            <Text color={INK.text}>{'Registered in Ollama as  '}</Text>
            <Text color={INK.primary} bold>{`"${modelName}"`}</Text>
          </Box>
        ) : (
          <Box flexDirection="column">
            <Box>
              <Text color={INK.warning} bold>{`${glyph.warning} `}</Text>
              <Text color={INK.warning} bold>{'SKIPPED   '}</Text>
              <Text color={INK.text}>{'Ollama not found or import failed'}</Text>
            </Box>
            <Box marginTop={0}>
              <Text color={INK.faint}>{'  Import manually:'}</Text>
            </Box>
            <Box
              borderStyle="single"
              borderColor={INK.secondary}
              paddingX={1}
              paddingY={0}
              marginTop={0}
            >
              <Text color={INK.primary} bold>
                {`ollama create ${modelName} -f ${modelfilePath}`}
              </Text>
            </Box>
          </Box>
        )}
      </Box>

      {/* ── Try It Now ────────────────────────────────────────────────── */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color={INK.faint} bold>{'TRY IT NOW'}</Text>
        <Box
          borderStyle="single"
          borderColor={INK.primary}
          paddingX={2}
          paddingY={0}
          marginTop={0}
        >
          <Text color={INK.primary} bold>{'$ '}</Text>
          <Text color="white" bold>{`ollama run ${modelName}`}</Text>
        </Box>
      </Box>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <Box>
        <Text color={INK.faint}>
          {glyph.prompt + ' Press any key to exit.'}
        </Text>
      </Box>
    </Box>
  );
}
