import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ClockSnapshot } from './hostData';
import type { WheelController, WheelUiSnapshot } from './WheelController';

/** The controller's current snapshot; re-renders when it changes. */
export const useWheelSnapshot = (controller: WheelController): WheelUiSnapshot =>
  useSyncExternalStore(controller.subscribe, controller.getSnapshot);

/** Milliseconds left on a clock, refreshed ten times a second while it runs; null with no clock. */
export function useClockRemaining(clock: ClockSnapshot | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  const running = clock?.running === true;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setNow(Date.now());
    }, 100);
    return () => {
      clearInterval(id);
    };
  }, [running]);
  if (!clock) return null;
  return running
    ? Math.max(0, clock.remainingMs - (Math.max(now, clock.asOf) - clock.asOf))
    : clock.remainingMs;
}
