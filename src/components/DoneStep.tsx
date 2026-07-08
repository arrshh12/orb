import React from 'react';
import { Box, Text, Newline, useInput } from 'ink';

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
        <Text color="green" bold>{'✨ '}</Text>
        <Text bold>Your model is ready!</Text>
      </Box>

      {/* File info */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="green"
        paddingX={2}
        paddingY={0}
        marginX={1}
        marginBottom={1}
      >
        <Newline />
        <Text>
          <Text color="gray">{'GGUF file:   '}</Text>
          <Text color="white" bold>{ggufPath}</Text>
          <Text color="gray">{` (${fileSize})`}</Text>
        </Text>
        <Text>
          <Text color="gray">{'Modelfile:   '}</Text>
          <Text color="white">{modelfilePath}</Text>
        </Text>
        <Newline />

        {/* Ollama import status */}
        {ollamaImported ? (
          <Text>
            <Text color="green" bold>{'✓ '}</Text>
            <Text>{'Imported to Ollama as "'}</Text>
            <Text color="cyan" bold>{modelName}</Text>
            <Text>{'"'}</Text>
          </Text>
        ) : (
          <Box flexDirection="column">
            <Text>
              <Text color="yellow" bold>{'⚠ '}</Text>
              <Text>{'Not imported to Ollama (Ollama not found or import failed)'}</Text>
            </Text>
            <Text color="gray" dimColor>
              {'  You can import manually:'}
            </Text>
            <Text color="cyan">
              {'    ollama create '}{modelName}{' -f '}{modelfilePath}
            </Text>
          </Box>
        )}
        <Newline />
      </Box>

      {/* Try it now */}
      <Box flexDirection="column" marginX={2}>
        <Text bold>Try it now:</Text>
        <Box
          borderStyle="round"
          borderColor="cyan"
          paddingX={2}
          paddingY={0}
          marginTop={0}
        >
          <Text color="cyan" bold>{'  ollama run '}{modelName}</Text>
        </Box>
      </Box>

      {/* Footer */}
      <Box marginX={2} marginTop={1}>
        <Text color="gray" dimColor>
          {'Thank you for using Loom! '}
          <Text color="gray">{'🧶'}</Text>
        </Text>
      </Box>
    </Box>
  );
}
