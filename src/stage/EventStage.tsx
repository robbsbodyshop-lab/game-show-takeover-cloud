import { useCallback, useEffect, useState } from 'react';
import { useAppServices } from '@/app/AppContext';
import { Button, Marquee, Panel } from '@/design';
import type { AuthUser } from '@/data';
import { eventReducer, type EventSession } from '@/engines/event';
import { logger } from '@/lib/logger';
import { FinishedEventView } from './FinishedEventView';
import { loadEventSeed, type LoadedEvent } from './loadEventSeed';
import { ResumePrompt } from './ResumePrompt';
import type { StageRegistry } from './screenContract';
import { StageSession } from './StageSession';
import styles from './EventStage.module.css';

export interface EventStageProps extends StageRegistry {
  eventId: string;
  user: AuthUser;
  /** The host's session ended while the event was open (FR-007). */
  signedOut: boolean;
  draw: () => number;
  now: () => number;
  onExit: () => void;
  onSignOut: () => void;
}

type Load =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error' }
  | { status: 'ready'; loaded: LoadedEvent };

interface Decision {
  /** The session to start from once the host chose Resume / Start new, or immediately for a new event. */
  session: EventSession;
  saveOnMount: boolean;
}

/**
 * Opens one event: loads the cloud copy and the browser cache, picks the newer one (FR-004/005),
 * offers Resume / Start a new event when there is progress (FR-006), shows finished events read-only,
 * and otherwise mounts the running stage.
 */
export const EventStage = ({
  eventId,
  user,
  signedOut,
  draw,
  now,
  onExit,
  onSignOut,
  games,
  screens,
}: EventStageProps) => {
  const { data } = useAppServices();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [decision, setDecision] = useState<Decision | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    loadEventSeed(data, eventId)
      .then((loaded) => {
        if (!active) return;
        setLoad(loaded ? { status: 'ready', loaded } : { status: 'missing' });
      })
      .catch((error: unknown) => {
        logger.warn('[stage] opening the event failed', error);
        if (active) setLoad({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [data, eventId, attempt]);

  const reload = useCallback((): void => {
    setLoad({ status: 'loading' });
    setDecision(null);
    setAttempt((n) => n + 1);
  }, []);

  const leave = useCallback(
    (finished: boolean): void => {
      if (!finished) {
        onExit();
        return;
      }
      // Leaving from the winner screen closes the event; it stays readable (FR-006).
      data.events
        .finishEvent(eventId)
        .catch((error: unknown) => {
          logger.warn('[stage] marking the event finished failed', error);
        })
        .finally(onExit);
    },
    [data, eventId, onExit],
  );

  if (load.status === 'loading') {
    return (
      <main className={styles.center}>
        <Panel>
          <p role="status">Opening the event...</p>
        </Panel>
      </main>
    );
  }
  if (load.status !== 'ready') {
    return (
      <main className={styles.center}>
        <Panel className={styles.problem}>
          <Marquee as="h1">
            {load.status === 'missing' ? 'Event not found' : 'Could not open the event'}
          </Marquee>
          <p role="alert">
            {load.status === 'missing'
              ? 'This event does not exist or belongs to another host.'
              : 'Check your connection and try again.'}
          </p>
          <div className={styles.actions}>
            {load.status === 'error' ? <Button onClick={reload}>Try again</Button> : null}
            <Button variant="secondary" onClick={onExit}>
              Back to my events
            </Button>
          </div>
        </Panel>
      </main>
    );
  }

  const { loaded } = load;
  if (loaded.event.status === 'finished') {
    return <FinishedEventView event={loaded.event} session={loaded.session} onBack={onExit} />;
  }

  const needsChoice = loaded.hasSavedState && loaded.session.phase !== 'setup';
  const chosen: Decision | null =
    decision ?? (needsChoice ? null : { session: loaded.session, saveOnMount: loaded.unsynced });
  if (chosen === null) {
    return (
      <ResumePrompt
        event={loaded.event}
        session={loaded.session}
        notice={loaded.notice}
        onResume={() => {
          setDecision({ session: loaded.session, saveOnMount: loaded.unsynced });
        }}
        onStartNew={() => {
          setDecision({ session: eventReducer(loaded.session, { type: 'NEW_EVENT' }), saveOnMount: true });
        }}
        onBack={onExit}
      />
    );
  }

  return (
    <StageSession
      event={loaded.event}
      user={user}
      initial={chosen.session}
      initialRev={loaded.rev}
      saveOnMount={chosen.saveOnMount}
      signedOut={signedOut}
      draw={draw}
      now={now}
      onExit={leave}
      onSignOut={onSignOut}
      onReload={reload}
      games={games}
      screens={screens}
    />
  );
};
