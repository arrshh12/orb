import chalk from 'chalk';

/**
 * Orb — Orbital Terminal Color System
 *
 * Cyberpunk-Minimalist palette from the Stitch "Orbital Terminal" design system.
 * Neon purple primary, deep violet structural accents, terminal green for success.
 * Respects NO_COLOR via Chalk's automatic detection.
 */

// ─── Hex Palette ─────────────────────────────────────────────────────────────

export const HEX = {
  primary:      '#8b5cf6',   // Neon purple — focus, active, selected, primary CTA
  secondary:    '#6d28d9',   // Deep violet — structural borders, inactive, metadata
  tertiary:     '#10b981',   // Terminal green — success, done states
  surface:      '#0d0d12',   // Void black — background
  container:    '#1f1f24',   // Container background (surface-container)
  text:         '#e4e1e9',   // Off-white — main body text
  textDim:      '#cbc3d7',   // Muted lavender — secondary/structural text
  textFaint:    '#958ea0',   // Faint — outline, separators
  alertCoral:   '#ffb4ab',   // Coral — warnings, gated states
  alertCrimson: '#93000a',   // Crimson bg — errors
  errorText:    '#ffb4ab',   // Error text
  gold:         '#a078ff',   // Primary container — highlights, special status
} as const;

// ─── Chalk Instances ─────────────────────────────────────────────────────────

/** Primary: neon purple — active elements, focus, selections */
export const colorPrimary = chalk.hex(HEX.primary);

/** Secondary: deep violet — borders, inactive, structural */
export const colorSecondary = chalk.hex(HEX.secondary);

/** Tertiary: terminal green — success, done */
export const colorTertiary = chalk.hex(HEX.tertiary);

/** Main body text */
export const colorText = chalk.hex(HEX.text);

/** Dim / structural text */
export const colorDim = chalk.hex(HEX.textDim);

/** Warning: coral — gated models, non-fatal warnings */
export const colorWarning = chalk.hex(HEX.alertCoral);

/** Error: crimson — fatal errors, OOM, hard blockers */
export const colorError = chalk.hex(HEX.errorText);

/** Gold/highlight: primary container */
export const colorGold = chalk.hex(HEX.gold);

// ─── Ink-Compatible Color Strings ────────────────────────────────────────────
// These are passed directly to <Text color={...}> in Ink components.

export const INK = {
  primary:   HEX.primary,
  secondary: HEX.secondary,
  tertiary:  HEX.tertiary,
  text:      HEX.text,
  dim:       HEX.textDim,
  faint:     HEX.textFaint,
  warning:   HEX.alertCoral,
  error:     HEX.errorText,
  gold:      HEX.gold,
  container: HEX.container,
} as const;

// ─── Glyphs ──────────────────────────────────────────────────────────────────
// Strictly text-based. No emoji. Ever.

export const glyph = {
  success:    '✓',
  error:      '✗',
  warning:    '!',
  active:     '▶',
  pending:    '○',
  bullet:     '▸',
  prompt:     '>',
  separator:  '─',
  block:      '█',
  shade:      '░',
  half:       '▌',
  dot:        '·',
  arrow:      '→',
  down:       '↓',
  up:         '↑',
  right:      '▷',
  check:      '[✓]',
  cross:      '[✗]',
  star:       '★',
} as const;

// Legacy alias — some components still import `icons`
export const icons = glyph;
