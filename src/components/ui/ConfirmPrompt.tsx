import React from 'react';
import { Box, Text } from 'ink';
import { ConfirmInput } from '@inkjs/ui';
import { INK, glyph } from '../../utils/colors.js';

interface ConfirmPromptProps {
  question: string;
  onConfirm: (yes: boolean) => void;
}

/**
 * Terminal-style confirm prompt.
 * Uses ">" prefix in primary cyan, not "?".
 */
export function ConfirmPrompt({
  question,
  onConfirm,
}: ConfirmPromptProps): React.ReactElement {
  return (
    <Box marginX={1} marginY={0}>
      <Text bold color={INK.primary}>{`${glyph.prompt} `}</Text>
      <Text bold color={INK.text}>{question} </Text>
      <ConfirmInput
        onConfirm={() => onConfirm(true)}
        onCancel={() => onConfirm(false)}
      />
    </Box>
  );
}
