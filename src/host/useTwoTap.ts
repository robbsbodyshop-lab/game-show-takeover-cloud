import { useCallback, useEffect, useRef, useState } from 'react';

export const TWO_TAP_WINDOW_MS = 4000;

/**
 * Destructive actions take two taps within 4 s (FR-019). The first press arms; the second within the
 * window confirms; the window closing disarms again.
 */
export function useTwoTap(onConfirm: () => void, windowMs: number = TWO_TAP_WINDOW_MS) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const press = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    if (armed) {
      timer.current = null;
      setArmed(false);
      onConfirm();
      return;
    }
    setArmed(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setArmed(false);
    }, windowMs);
  }, [armed, onConfirm, windowMs]);

  return { armed, press };
}
