import React from 'react';
import { Box, Text } from 'ink';
import { INK } from '../../utils/colors.js';
import { useFrameCycle } from '../../utils/useFrameCycle.js';

interface SpinnerProps {
  /** The message displayed next to the spinner */
  message: string;
  noAnimation?: boolean;
}

// Braille-dot spinner — feels like a scanning phosphor
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Bioluminescent spinner.
 * Cyan glyph cycling through braille frames at 80ms.
 */
export function Spinner({ message, noAnimation = false }: SpinnerProps): React.ReactElement {
  const frame = useFrameCycle(SPINNER_FRAMES, 80, noAnimation);

  return (
    <Box marginX={1}>
      <Text color={INK.primary}>{frame} </Text>
      <Text color={INK.text}>{message}</Text>
    </Box>
  );
}
