import React from 'react';
import { Box } from 'ink';
import { Spinner as InkSpinner } from '@inkjs/ui';

interface SpinnerProps {
  /** The message displayed next to the spinner */
  message: string;
}

/**
 * Simple spinner with a message. Wraps @inkjs/ui Spinner.
 *
 *   ◐ Loading model metadata...
 */
export function Spinner({ message }: SpinnerProps): React.ReactElement {
  return (
    <Box marginX={1}>
      <InkSpinner label={message} />
    </Box>
  );
}
