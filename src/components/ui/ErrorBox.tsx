import React from 'react';
import { Box, Text, Newline } from 'ink';
import { INK, glyph } from '../../utils/colors.js';

interface ErrorBoxProps {
  title?: string;
  message: string;
  guidance?: string;
}

/**
 * Crimson-bordered error display.
 * Single-border (rectilinear), crimson accent, dim guidance text.
 */
export function ErrorBox({
  title = 'ERROR',
  message,
  guidance,
}: ErrorBoxProps): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={INK.error}
      paddingX={2}
      paddingY={0}
      marginX={1}
      marginY={1}
    >
      <Text bold color={INK.error}>
        {`${glyph.error} ${title.toUpperCase()}`}
      </Text>
      <Box marginTop={0}>
        <Text color="white">{message}</Text>
      </Box>
      {guidance && (
        <>
          <Newline />
          <Text color={INK.dim}>{guidance}</Text>
        </>
      )}
    </Box>
  );
}
