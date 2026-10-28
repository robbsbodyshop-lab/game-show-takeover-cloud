import { useEffect, useRef } from 'react';
import type { EventAction, EventSession } from '@/engines/event';

/**
 * Freezes the Speed Round clock (an event-engine clock) while the stage is locked and resumes it
 * afterwards, but only when this hook paused it; a clock the host paused by hand stays paused.
 */
export function useSpeedClockLock(
  session: EventSession,
  inputLocked: boolean,
  dispatch: (action: EventAction) => void,
  now: () => number,
): void {
  const pausedHere = useRef(false);
  const status = session.speed?.status ?? null;

  useEffect(() => {
    if (inputLocked && status === 'running') {
      pausedHere.current = true;
      dispatch({ type: 'SPEED_PAUSE', now: now() });
    } else if (!inputLocked && pausedHere.current) {
      pausedHere.current = false;
      if (status === 'paused') dispatch({ type: 'SPEED_RESUME', now: now() });
    }
  }, [inputLocked, status, dispatch, now]);
}
