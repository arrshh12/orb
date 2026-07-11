import React from 'react';
import { Box, Text } from 'ink';
import { INK, glyph } from '../../utils/colors.js';

type Tab = 'model' | 'dataset' | 'train';

interface TabHeaderProps {
  activeTab: Tab;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'model', label: 'MODEL' },
  { id: 'dataset', label: 'DATASET' },
  { id: 'train', label: 'TRAIN' },
];

/**
 * Persistent tab navigation header.
 * Active tab glows primary cyan; inactive tabs are muted secondary purple.
 * Rectilinear single-border style per the Bioluminescent spec.
 */
export function TabHeader({ activeTab }: TabHeaderProps): React.ReactElement {
  return (
    <Box marginX={1} marginBottom={1} borderStyle="single" borderColor={INK.secondary} paddingX={1}>
      {TABS.map((tab, index) => {
        const isActive = tab.id === activeTab;
        const isLast = index === TABS.length - 1;

        return (
          <Box key={tab.id}>
            <Text
              color={isActive ? INK.primary : INK.dim}
              bold={isActive}
            >
              {isActive ? `${glyph.active} ${tab.label}` : `  ${tab.label}`}
            </Text>
            {!isLast && <Text color={INK.secondary}>{'  │  '}</Text>}
          </Box>
        );
      })}
    </Box>
  );
}
