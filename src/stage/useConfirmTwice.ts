import { useCallback, useEffect, useRef, useState } from 'react';

export const CONFIRM_WINDOW_MS = 4000;

export interface ConfirmTwice {
  /** True between the first tap and the confirming tap (or the timeout). */
  armed: boolean;
  /** First tap arms; a second tap within the window runs `onConfirm`. */
  trigger: () => void;
  cancel: () => void;
}

/**
 * Two-tap confirmation for destructive actions (FR-019, HOST_FEATURE_INVENTORY.md 2.2): the first
 * tap changes the label to "Tap again: ...", the second tap within 4 s confirms, otherwise it
 * disarms itself.
 */
export function useConfirmTwice(onConfirm: () => void, windowMs: number = CONFIRM_WINDOW_MS): ConfirmTwice {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmRef = useRef(onConfirm);

  useEffect(() => {
    confirmRef.current = onConfirm;
  });

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  const cancel = useCallback(() => {
    clear();
    setArmed(false);
  }, [clear]);

  const trigger = useCallback(() => {
    if (timer.current !== null) {
      clear();
      setArmed(false);
      confirmRef.current();
      return;
    }
    setArmed(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setArmed(false);
    }, windowMs);
  }, [clear, windowMs]);

  return { armed, trigger, cancel };
}
