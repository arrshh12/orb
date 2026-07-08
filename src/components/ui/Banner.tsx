import React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';
import { Fish } from './Fish.js';

/**
 * A gradient ASCII art banner showing "ORB" with a tagline and animated fish.
 */
export function Banner(): React.ReactElement {
  return (
    <Box flexDirection="column" alignItems="center" marginBottom={1}>
      <Box
        borderStyle="double"
        borderColor="cyan"
        paddingX={2}
        paddingY={0}
        flexDirection="column"
        alignItems="center"
      >
        <Gradient name="pastel">
          <BigText text="ORB" font="chrome" />
        </Gradient>
        <Text color="gray" italic>
          Fine-tune any LLM on your laptop
        </Text>
      </Box>
      <Fish />
    </Box>
  );
}
