import { useEffect, useState } from 'react';

export const CURSOR_IDLE_MS = 3000;

/** True once the pointer has been still for 3 s while `enabled` (show mode hides the cursor). */
export function useIdleCursor(enabled: boolean, idleMs: number = CURSOR_IDLE_MS): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const start = (): void => {
      timer = setTimeout(() => {
        setIdle(true);
      }, idleMs);
    };
    const arm = (): void => {
      setIdle(false);
      if (timer !== null) clearTimeout(timer);
      start();
    };
    start();
    window.addEventListener('pointermove', arm);
    window.addEventListener('pointerdown', arm);
    return () => {
      if (timer !== null) clearTimeout(timer);
      window.removeEventListener('pointermove', arm);
      window.removeEventListener('pointerdown', arm);
      setIdle(false);
    };
  }, [enabled, idleMs]);

  return enabled && idle;
}
