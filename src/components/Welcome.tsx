import React from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import type { HardwareInfo } from '../types/hardware.js';
import { HardwareTable } from './ui/HardwareTable.js';
import { ErrorBox } from './ui/ErrorBox.js';
import { INK, glyph } from '../utils/colors.js';

interface WelcomeProps {
  hardware: HardwareInfo;
  onContinue: () => void;
}

/**
 * Orbital Terminal welcome screen.
 * 1. Hardware summary table
 * 2. If CPU-only: error box with guidance, then exit
 * 3. If viable: neon purple READY status + press Enter prompt
 */
export function Welcome({ hardware, onContinue }: WelcomeProps): React.ReactElement {
  const { exit } = useApp();
  const isCpuOnly = hardware.backend === 'cpu-only';

  useInput((_input, key) => {
    if (isCpuOnly) {
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
    <Box flexDirection="column" marginX={1}>
      <HardwareTable hardware={hardware} />

      {isCpuOnly ? (
        <Box flexDirection="column">
          <ErrorBox
            title="NO GPU DETECTED"
            message="QLoRA fine-tuning requires a GPU with at least 4 GB of VRAM."
            guidance={
              'Orb needs an NVIDIA GPU (CUDA) or Apple Silicon (MLX) to train.\n' +
              'CPU-only training is not currently supported.\n\n' +
              'Press Enter to exit.'
            }
          />
        </Box>
      ) : (
        <Box flexDirection="column">
          {/* Status chip — ready */}
          <Box
            borderStyle="single"
            borderColor={INK.tertiary}
            paddingX={2}
            paddingY={0}
            marginBottom={1}
          >
            <Text color={INK.tertiary} bold>{`${glyph.check} `}</Text>
            <Text color={INK.tertiary} bold>{'HARDWARE OK  '}</Text>
            <Text color={INK.text}>{'Your system is ready for fine-tuning.'}</Text>
          </Box>

          {/* Enter prompt */}
          <Box>
            <Text color={INK.primary} bold>{glyph.prompt + ' '}</Text>
            <Text color={INK.text}>{'Press '}</Text>
            <Text color="white" bold>{'Enter'}</Text>
            <Text color={INK.text}>{' to continue '}</Text>
            <Text color={INK.secondary}>{glyph.arrow}</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
