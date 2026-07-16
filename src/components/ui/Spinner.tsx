import React from 'react';
import { Box, Text } from 'ink';
import { INK } from '../../utils/colors.js';
import { useFrameCycle } from '../../utils/useFrameCycle.js';

interface SpinnerProps {
  /** The message displayed next to the spinner */
  message: string;
  noAnimation?: boolean;
}

// Orbital Terminal: smooth braille scanning animation
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Orbital Terminal spinner.
 * Neon purple braille glyph cycling at 80ms — feels like a terminal scanner.
 */
export function Spinner({ message, noAnimation = false }: SpinnerProps): React.ReactElement {
  const frame = useFrameCycle(SPINNER_FRAMES, 80, noAnimation);

  return (
    <Box marginX={1}>
      <Text color={INK.primary} bold>{noAnimation ? '⠿' : frame}</Text>
      <Text color={INK.faint}>{' '}</Text>
      <Text color={INK.text}>{message}</Text>
    </Box>
  );
}
