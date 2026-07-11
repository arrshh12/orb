import React from 'react';
import { Text } from 'ink';
import { getMascotIdle, getMascotFrame, getMascotDone, MascotOptions } from '../../utils/mascot.js';
import { useFrameCycle } from '../../utils/useFrameCycle.js';
import { INK } from '../../utils/colors.js';

interface MascotProps {
  state: 'idle' | 'working' | 'done';
  noAnimation?: boolean;
  asciiOnly?: boolean;
}

/**
 * The Orb mascot — a bioluminescent creature.
 * Glows primary cyan when working, gold when done, secondary purple when idle.
 */
export function Mascot({ state, noAnimation = false, asciiOnly = false }: MascotProps): React.ReactElement {
  const options: MascotOptions = { asciiOnly };

  const frames = [
    getMascotFrame(0, options),
    getMascotFrame(1, options),
    getMascotFrame(2, options),
    getMascotFrame(3, options),
  ];

  const currentFrame = useFrameCycle(frames, 200, state !== 'working' || noAnimation);

  let glyph = '';
  if (state === 'idle') glyph = getMascotIdle(options);
  else if (state === 'done') glyph = getMascotDone(options);
  else {
    glyph = noAnimation ? getMascotIdle(options) : currentFrame;
  }

  // Bioluminescent color mapping
  const color = state === 'done' ? INK.gold : state === 'working' ? INK.primary : INK.secondary;

  return <Text color={color} bold>{glyph}</Text>;
}
