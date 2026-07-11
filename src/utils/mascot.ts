/**
 * Orb Mascot Module
 * 
 * Defines the spider-orb mascot frames and logic.
 * Respects Unicode support and NO_COLOR/animation flags.
 */

const UNICODE_IDLE = ' ◉ ';
const UNICODE_FRAMES = ['/◉\\', '-◉-', '\\◉/', '-◉-'];
const UNICODE_DONE = ' ★ ';

const ASCII_IDLE = ' O ';
const ASCII_FRAMES = ['/O\\', '-O-', '\\O/', '-O-'];
const ASCII_DONE = ' * ';

export interface MascotOptions {
  asciiOnly?: boolean;
}

export function getMascotIdle(options?: MascotOptions): string {
  return options?.asciiOnly ? ASCII_IDLE : UNICODE_IDLE;
}

export function getMascotFrame(index: number, options?: MascotOptions): string {
  const frames = options?.asciiOnly ? ASCII_FRAMES : UNICODE_FRAMES;
  return frames[index % frames.length];
}

export function getMascotDone(options?: MascotOptions): string {
  return options?.asciiOnly ? ASCII_DONE : UNICODE_DONE;
}
