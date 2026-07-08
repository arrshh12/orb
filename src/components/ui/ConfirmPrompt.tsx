import React from 'react';
import { Box, Text } from 'ink';
import { ConfirmInput } from '@inkjs/ui';

interface ConfirmPromptProps {
  /** The question to ask */
  question: string;
  /** Callback when the user confirms or denies */
  onConfirm: (yes: boolean) => void;
}

/**
 * Yes/no confirmation with a question. Wraps @inkjs/ui ConfirmInput.
 *
 *   ? Continue with training? (Y/n)
 */
export function ConfirmPrompt({
  question,
  onConfirm,
}: ConfirmPromptProps): React.ReactElement {
  return (
    <Box marginX={1} marginY={0}>
      <Text bold color="cyan">{'? '}</Text>
      <Text bold>{question} </Text>
      <ConfirmInput
        onConfirm={() => onConfirm(true)}
        onCancel={() => onConfirm(false)}
      />
    </Box>
  );
}
