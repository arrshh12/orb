import { useState, useEffect } from 'react';

export function useFrameCycle(
  frames: string[],
  intervalMs: number = 200,
  noAnimation: boolean = false
): string {
  const [frameIdx, setFrameIdx] = useState(0);

  useEffect(() => {
    if (noAnimation || frames.length <= 1) return;

    const timer = setInterval(() => {
      setFrameIdx((prev) => (prev + 1) % frames.length);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [frames.length, intervalMs, noAnimation]);

  return noAnimation ? frames[0]! : frames[frameIdx]!;
}
