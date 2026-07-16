import React from 'react';
import { Text } from 'ink';
import { INK } from '../../utils/colors.js';
import { useFrameCycle } from '../../utils/useFrameCycle.js';

interface MascotProps {
  state: 'idle' | 'working' | 'done';
  noAnimation?: boolean;
  asciiOnly?: boolean;
}

// Orbital Terminal: ORB glyphs — pulsing energy orb
const WORKING_FRAMES = [
  '◎',
  '●',
  '◉',
  '●',
];

const IDLE_GLYPH  = '◎';
const DONE_GLYPH  = '✦';

/**
 * Orbital Terminal mascot — the Orb itself.
 * Neon purple pulsing orb when working.
 * Terminal green star when done.
 * Muted violet ring when idle.
 */
export function Mascot({ state, noAnimation = false }: MascotProps): React.ReactElement {
  const frame = useFrameCycle(WORKING_FRAMES, 300, state !== 'working' || noAnimation);

  let glyphChar = '';
  if (state === 'idle') glyphChar = IDLE_GLYPH;
  else if (state === 'done') glyphChar = DONE_GLYPH;
  else glyphChar = noAnimation ? IDLE_GLYPH : frame;

  // Orbital Terminal color mapping
  const color =
    state === 'done'    ? INK.tertiary  :   // terminal green
    state === 'working' ? INK.primary   :   // neon purple
                          INK.secondary;    // deep violet (idle)

  return <Text color={color} bold>{glyphChar}</Text>;
}
