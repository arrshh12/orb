import React from 'react';
import { Box, Text } from 'ink';
import { INK, glyph } from '../../utils/colors.js';

/**
 * Orbital Terminal — ASCII art ORB logo header.
 * Renders the branded ORB wordmark in neon purple with structural border.
 * Inspired by the Stitch "Orbital Terminal" design system.
 */

const ORB_LOGO = [
  ' ██████╗ ██████╗ ██████╗ ',
  '██╔═══██╗██╔══██╗██╔══██╗',
  '██║   ██║██████╔╝██████╔╝',
  '██║   ██║██╔══██╗██╔══██╗',
  '╚██████╔╝██║  ██║██████╔╝',
  ' ╚═════╝ ╚═╝  ╚═╝╚═════╝ ',
];

const ORB_LOGO_COMPACT = [
  '┌─────────────────────┐',
  '│  ▄██▄  ██▄  ██▄    │',
  '│ ██  ██ ██▀█ ██▀█   │',
  '│ ██  ██ ██ █▄██ █▄  │',
  '│  ▀██▀  ██   ▀██  ▀ │',
  '└─────────────────────┘',
];

interface OrbHeaderProps {
  compact?: boolean;
  subtitle?: string;
}

export function OrbHeader({ compact = false, subtitle }: OrbHeaderProps): React.ReactElement {
  const logo = compact ? ORB_LOGO_COMPACT : ORB_LOGO;
  return (
    <Box flexDirection="column" alignItems="center" marginBottom={0}>
      {logo.map((line, i) => (
        <Text key={i} color={INK.primary} bold>
          {line}
        </Text>
      ))}
      {subtitle && (
        <Box marginTop={0}>
          <Text color={INK.faint}>
            {'  '}
            {glyph.separator.repeat(4)}
            {'  '}
            <Text color={INK.secondary}>{subtitle}</Text>
            {'  '}
            {glyph.separator.repeat(4)}
          </Text>
        </Box>
      )}
    </Box>
  );
}
