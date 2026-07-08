import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';

const BUBBLES = [
  "   .\n  ><(((º>",
  "  o \n  ><(((°>",
  " O  \n  ><(((º>",
  "   .\n  ><(((°>",
];

export function Fish(): React.ReactElement {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % BUBBLES.length);
    }, 400);
    return () => clearInterval(timer);
  }, []);

  return (
    <Box flexDirection="column" alignItems="center" marginY={1}>
      <Text color="cyanBright">{BUBBLES[frame]}</Text>
    </Box>
  );
}
