/**
 * Utility functions for human-readable formatting.
 * Used throughout the CLI to display sizes, durations, and numbers.
 */

/** Format bytes as human-readable string (e.g., "4.2 GB") */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]!}`;
}

/** Format megabytes as human-readable string (e.g., "12 GB") */
export function formatMB(mb: number): string {
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)} GB`;
  }
  return `${Math.round(mb)} MB`;
}

/** Format gigabytes with one decimal (e.g., "5.2 GB") */
export function formatGB(gb: number): string {
  return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)} GB`;
}

/** Format seconds as human-readable duration (e.g., "18 min 23 sec") */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)} sec`;
  }
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return secs > 0 ? `${mins} min ${secs} sec` : `${mins} min`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
}

/** Format a time estimate range (e.g., "25–45 minutes") */
export function formatTimeRange(lowMinutes: number, highMinutes: number): string {
  if (highMinutes < 1) {
    return 'less than a minute';
  }
  if (lowMinutes < 60 && highMinutes < 60) {
    return `${Math.round(lowMinutes)}–${Math.round(highMinutes)} minutes`;
  }
  const lowStr = formatDuration(lowMinutes * 60);
  const highStr = formatDuration(highMinutes * 60);
  return `${lowStr} – ${highStr}`;
}

/** Format a number with commas (e.g., 1234567 → "1,234,567") */
export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/** Format parameter count in human-readable form (e.g., "7.2B", "1.1B", "350M") */
export function formatParams(count: number): string {
  if (count >= 1e9) {
    const b = count / 1e9;
    return `${b < 10 ? b.toFixed(1) : Math.round(b)}B`;
  }
  if (count >= 1e6) {
    const m = count / 1e6;
    return `${m < 10 ? m.toFixed(1) : Math.round(m)}M`;
  }
  return formatNumber(count);
}

/** Format a learning rate (e.g., 0.0002 → "2e-4") */
export function formatLR(lr: number): string {
  if (lr >= 0.01) return lr.toString();
  const exp = Math.floor(Math.log10(lr));
  const mantissa = lr / Math.pow(10, exp);
  return `${mantissa % 1 === 0 ? mantissa : mantissa.toFixed(1)}e${exp}`;
}

/** Truncate a string to maxLen chars, adding "..." if truncated */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

/** Format a percentage (e.g., 0.67 → "67%") */
export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
