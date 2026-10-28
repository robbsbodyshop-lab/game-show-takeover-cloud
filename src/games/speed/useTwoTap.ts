import { useCallback, useEffect, useRef, useState } from 'react';

export const TWO_TAP_WINDOW_MS = 4000;

export interface TwoTap {
  /** True between the first and second tap. */
  armed: boolean;
  /** Wire to onClick. First tap arms, the second within the window confirms. */
  press: () => void;
  disarm: () => void;
}

/** "Tap again to confirm" (HOST_FEATURE_INVENTORY.md 2.2): the first tap only arms, 4 s later it disarms. */
export const useTwoTap = (onConfirm: () => void, windowMs: number = TWO_TAP_WINDOW_MS): TwoTap => {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  const disarm = useCallback(() => {
    clear();
    setArmed(false);
  }, [clear]);

  const press = useCallback(() => {
    if (armed) {
      disarm();
      onConfirm();
      return;
    }
    setArmed(true);
    clear();
    timer.current = setTimeout(() => {
      timer.current = null;
      setArmed(false);
    }, windowMs);
  }, [armed, clear, disarm, onConfirm, windowMs]);

  return { armed, press, disarm };
};
