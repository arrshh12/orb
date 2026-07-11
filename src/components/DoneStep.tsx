import React from 'react';
import { Box, Text, Newline, useInput } from 'ink';
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
 * Success screen shown after training and export are complete.
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
    <Box flexDirection="column">
      {/* Hero */}
      <Box marginX={1} marginBottom={1}>
        <Text color={INK.primary} bold>{'MODEL READY'}</Text>
      </Box>

      {/* File info */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={INK.primary}
        paddingX={2}
        paddingY={0}
        marginX={1}
        marginBottom={1}
      >
        <Newline />
        <Text>
          <Text color={INK.dim}>{'GGUF file:   '}</Text>
          <Text color="white" bold>{ggufPath}</Text>
          <Text color={INK.dim}>{` (${fileSize})`}</Text>
        </Text>
        <Text>
          <Text color={INK.dim}>{'Modelfile:   '}</Text>
          <Text color="white" bold>{modelfilePath}</Text>
        </Text>
        <Newline />

        {/* Ollama import status */}
        {ollamaImported ? (
          <Text>
            <Text color={INK.primary} bold>{`${glyph.success} `}</Text>
            <Text color={INK.primary} bold>{'[IMPORTED]'}</Text>
            <Text color={INK.text}>{' Imported to Ollama as "'}</Text>
            <Text color={INK.primary} bold>{modelName}</Text>
            <Text color={INK.text}>{'"'}</Text>
          </Text>
        ) : (
          <Box flexDirection="column">
            <Text>
              <Text color={INK.warning} bold>{`${glyph.warning} `}</Text>
              <Text color={INK.warning} bold>{'[SKIPPED]'}</Text>
              <Text color={INK.text}>{' Not imported to Ollama (Ollama not found or import failed)'}</Text>
            </Text>
            <Text color={INK.dim}>
              {'  You can import manually:'}
            </Text>
            <Text color={INK.primary}>
              {'    ollama create '}{modelName}{' -f '}{modelfilePath}
            </Text>
          </Box>
        )}
        <Newline />
      </Box>

      {/* Try it now */}
      <Box flexDirection="column" marginX={2}>
        <Text color={INK.text} bold>Try it now:</Text>
        <Box
          borderStyle="single"
          borderColor={INK.primary}
          paddingX={2}
          paddingY={0}
          marginTop={0}
        >
          <Text color={INK.primary} bold>{'  ollama run '}{modelName}</Text>
        </Box>
      </Box>

      {/* Footer */}
      <Box marginX={2} marginTop={1}>
        <Text color={INK.dim}>
          {'Press any key to exit.'}
        </Text>
      </Box>
    </Box>
  );
}
