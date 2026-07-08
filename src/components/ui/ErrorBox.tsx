import React from 'react';
import { Box, Text, Newline } from 'ink';

interface ErrorBoxProps {
  /** Title for the error box (defaults to "Error") */
  title?: string;
  /** The main error message */
  message: string;
  /** Optional guidance / help text */
  guidance?: string;
}

/**
 * Red-bordered error display with a guidance message.
 *
 *   ┌─ Error ────────────────────────────────┐
 *   │  Model "foo/bar" was not found.        │
 *   │                                         │
 *   │  Check the model ID — it should look   │
 *   │  like "organization/model-name".       │
 *   └─────────────────────────────────────────┘
 */
export function ErrorBox({
  title = 'Error',
  message,
  guidance,
}: ErrorBoxProps): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="red"
      paddingX={2}
      paddingY={0}
      marginX={1}
      marginY={1}
    >
      <Text bold color="red">
        {'✖ '}{title}
      </Text>
      <Box marginTop={0}>
        <Text color="white">{message}</Text>
      </Box>
      {guidance && (
        <>
          <Newline />
          <Text color="yellow" dimColor>{guidance}</Text>
        </>
      )}
    </Box>
  );
}
