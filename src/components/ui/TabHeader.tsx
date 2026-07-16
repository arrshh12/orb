import React from 'react';
import { Box, Text } from 'ink';
import { INK, glyph } from '../../utils/colors.js';

type Tab = 'model' | 'dataset' | 'train';

interface TabHeaderProps {
  activeTab: Tab;
}

const TABS: { id: Tab; label: string; index: number }[] = [
  { id: 'model',   label: 'MODEL',   index: 1 },
  { id: 'dataset', label: 'DATASET', index: 2 },
  { id: 'train',   label: 'TRAIN',   index: 3 },
];

/**
 * Orbital Terminal tab navigation.
 * Active tab glows neon purple with ▶ prefix.
 * Inactive tabs muted violet. Sharp borders per Stitch spec.
 */
export function TabHeader({ activeTab }: TabHeaderProps): React.ReactElement {
  return (
    <Box flexDirection="column" marginX={1} marginBottom={0}>
      {/* Top separator line */}
      <Box>
        <Text color={INK.secondary}>
          {'┌─ '}
          <Text color={INK.primary} bold>ORBITAL TERMINAL</Text>
          {' '}
          <Text color={INK.faint}>v1 · AI FINE-TUNING CLI</Text>
          {' '}
        </Text>
      </Box>
      {/* Tab row */}
      <Box borderStyle="single" borderColor={INK.secondary} paddingX={1} paddingY={0}>
        {TABS.map((tab, index) => {
          const isActive = tab.id === activeTab;
          const isLast = index === TABS.length - 1;

          return (
            <Box key={tab.id}>
              <Box
                paddingX={1}
                borderStyle={isActive ? 'single' : undefined}
                borderColor={isActive ? INK.primary : undefined}
              >
                <Text
                  color={isActive ? INK.primary : INK.faint}
                  bold={isActive}
                >
                  {isActive
                    ? `${glyph.active} ${tab.index}. ${tab.label}`
                    : `  ${tab.index}. ${tab.label}`}
                </Text>
              </Box>
              {!isLast && (
                <Text color={INK.secondary}>{'  │  '}</Text>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
