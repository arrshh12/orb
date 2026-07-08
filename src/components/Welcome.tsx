import React from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import type { HardwareInfo } from '../types/hardware.js';
import { Banner } from './ui/Banner.js';
import { HardwareTable } from './ui/HardwareTable.js';
import { ErrorBox } from './ui/ErrorBox.js';

interface WelcomeProps {
  hardware: HardwareInfo;
  onContinue: () => void;
}

/**
 * First wizard screen:
 * 1. Render the Banner
 * 2. Show HardwareTable with detected info
 * 3. If CPU-only: show ErrorBox explaining training isn't feasible, then exit
 * 4. If viable: show "Press Enter to begin" prompt
 */
export function Welcome({ hardware, onContinue }: WelcomeProps): React.ReactElement {
  const { exit } = useApp();
  const isCpuOnly = hardware.backend === 'cpu-only';

  useInput((_input, key) => {
    if (isCpuOnly) {
      // Any key exits when not viable
      if (key.return || key.escape) {
        exit();
      }
      return;
    }
    if (key.return) {
      onContinue();
    }
  });

  return (
    <Box flexDirection="column">
      <Banner />
      <HardwareTable hardware={hardware} />

      {isCpuOnly ? (
        <Box flexDirection="column" marginX={1}>
          <ErrorBox
            title="No GPU Detected"
            message="QLoRA fine-tuning requires a GPU with at least 4 GB of VRAM."
            guidance={
              'Loom needs an NVIDIA GPU (CUDA) or Apple Silicon (MLX) to train.\n' +
              'CPU-only training is not currently supported.\n\n' +
              'Press Enter to exit.'
            }
          />
        </Box>
      ) : (
        <Box flexDirection="column" marginX={1}>
          <Box marginX={1}>
            <Text color="green" bold>{'✓ '}</Text>
            <Text>Your hardware looks good for fine-tuning!</Text>
          </Box>
          <Box marginX={1} marginTop={1}>
            <Text color="cyan" bold dimColor>
              Press <Text color="white" bold>Enter</Text> to begin →
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
