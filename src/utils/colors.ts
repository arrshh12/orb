import chalk from 'chalk';

/**
 * Orb — Bioluminescent Terminal Color System
 *
 * High-Tech Noir + Cyber-Brutalism palette.
 * Colors map to semantic roles, not literal hues.
 * Respects NO_COLOR via Chalk's automatic detection.
 */

// ─── Hex Palette ─────────────────────────────────────────────────────────────

export const HEX = {
  primary:      '#00F0FF',   // Electric cyan — focus, active, selected, primary CTA
  secondary:    '#6A5C82',   // Dusty purple — structural borders, inactive, metadata
  surface:      '#0B0811',   // Near-black purple — background
  container:    '#161122',   // Container background
  text:         '#E0D8EA',   // Light lavender — main body text
  textDim:      '#849495',   // Muted gray — secondary/structural text
  alertCoral:   '#FF4E50',   // Coral — warnings, gated states
  alertCrimson: '#FF1F3A',   // Crimson — critical errors, OOM
  gold:         '#FED639',   // Tertiary gold — highlights, special status
} as const;

// ─── Chalk Instances ─────────────────────────────────────────────────────────

/** Primary: electric cyan — active elements, focus, selections */
export const colorPrimary = chalk.hex(HEX.primary);

/** Secondary: dusty purple — borders, inactive, structural */
export const colorSecondary = chalk.hex(HEX.secondary);

/** Main body text */
export const colorText = chalk.hex(HEX.text);

/** Dim / structural text */
export const colorDim = chalk.hex(HEX.textDim);

/** Warning: coral — gated models, non-fatal warnings */
export const colorWarning = chalk.hex(HEX.alertCoral);

/** Error: crimson — fatal errors, OOM, hard blockers */
export const colorError = chalk.hex(HEX.alertCrimson);

/** Gold: tertiary highlight */
export const colorGold = chalk.hex(HEX.gold);

// ─── Ink-Compatible Color Strings ────────────────────────────────────────────
// These are passed directly to <Text color={...}> in Ink components.

export const INK = {
  primary:   HEX.primary,
  secondary: HEX.secondary,
  text:      HEX.text,
  dim:       HEX.textDim,
  warning:   HEX.alertCoral,
  error:     HEX.alertCrimson,
  gold:      HEX.gold,
} as const;

// ─── Glyphs ──────────────────────────────────────────────────────────────────
// Strictly text-based. No emoji. Ever.

export const glyph = {
  success:    '✓',
  error:      '✗',
  warning:    '!',
  active:     '■',
  pending:    '○',
  bullet:     '▸',
  prompt:     '>',
  separator:  '─',
  block:      '█',
} as const;

// Legacy alias — some components still import `icons`
export const icons = glyph;
