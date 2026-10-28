import { useCallback, useState, type ReactNode } from 'react';
import { eventReducer, type EventAction, type EventSession } from '@/engines/event';

export interface EventHarnessProps {
  initial: EventSession;
  /** Every action the screen dispatched, in order. */
  log: EventAction[];
  children: (session: EventSession, dispatch: (action: EventAction) => void) => ReactNode;
}

/** Test host for the event screens: owns the session, applies the real reducer and records actions. */
export const EventHarness = ({ initial, log, children }: EventHarnessProps) => {
  const [session, setSession] = useState(initial);
  const dispatch = useCallback(
    (action: EventAction) => {
      log.push(action);
      setSession((s) => eventReducer(s, action));
    },
    [log],
  );
  return <>{children(session, dispatch)}</>;
};
