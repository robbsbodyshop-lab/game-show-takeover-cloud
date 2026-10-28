/** Test-only: a component that owns a real `eventReducer`, so screens can be exercised end to end. */
import { useReducer, type ReactNode } from 'react';
import { eventReducer, type EventAction, type EventSession } from '@/engines/event';

export interface HarnessApi {
  session: EventSession;
  dispatch: (action: EventAction) => void;
}

export const ReducerHarness = ({
  initial,
  children,
  onDispatch,
}: {
  initial: EventSession;
  children: (api: HarnessApi) => ReactNode;
  onDispatch?: (action: EventAction) => void;
}) => {
  const [session, dispatch] = useReducer(eventReducer, initial);
  return (
    <>
      {children({
        session,
        dispatch: (action) => {
          onDispatch?.(action);
          dispatch(action);
        },
      })}
    </>
  );
};
