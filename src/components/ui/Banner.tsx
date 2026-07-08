import React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';

/**
 * A gradient ASCII art banner showing "LOOM" with a tagline.
 *
 * ╔══════════════════════════════════════╗
 *   L O O M
 *   Fine-tune any LLM on your laptop
 * ╚══════════════════════════════════════╝
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
          <BigText text="LOOM" font="chrome" />
        </Gradient>
        <Text color="gray" italic>
          Fine-tune any LLM on your laptop
        </Text>
      </Box>
    </Box>
  );
}
