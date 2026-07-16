import React from 'react';
import { Box, Text, Newline } from 'ink';
import { INK, glyph } from '../../utils/colors.js';

interface ErrorBoxProps {
  title?: string;
  message: string;
  guidance?: string;
}

/**
 * Orbital Terminal error display.
 * Single-border in error red, bold error header, dim guidance text.
 * Per Stitch spec: sharp corners, no rounding, status chips with defined colors.
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
      {/* Title bar — error status chip */}
      <Box>
        <Text bold color={INK.error}>
          {`${glyph.cross} `}
        </Text>
        <Text bold color={INK.error}>
          {title.toUpperCase()}
        </Text>
      </Box>

      {/* Separator */}
      <Text color={INK.faint}>{glyph.separator.repeat(40)}</Text>

      {/* Message */}
      <Box marginTop={0}>
        <Text color="white">{message}</Text>
      </Box>

      {/* Guidance */}
      {guidance && (
        <>
          <Newline />
          <Box>
            <Text color={INK.faint}>{glyph.prompt} </Text>
            <Text color={INK.dim}>{guidance}</Text>
          </Box>
        </>
      )}
    </Box>
  );
}
