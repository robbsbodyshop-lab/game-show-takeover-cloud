import { useState } from 'react';
import { useAppServices } from '@/app/AppContext';
import { BootScreen, Panel } from '@/design';
import type { AuthUser } from '@/data';
import { AuthScreen } from './AuthScreen';
import { ErrorBoundary } from './ErrorBoundary';
import { EventStage } from './EventStage';
import { EventsScreen } from './EventsScreen';
import type { StageRegistry } from './screenContract';
import { useAuthSession } from './useAuthSession';
import styles from './StageApp.module.css';

export const BOOT_FLAG = 'gst:booted';

const readBooted = (): boolean => {
  try {
    return globalThis.sessionStorage.getItem(BOOT_FLAG) === '1';
  } catch {
    return false;
  }
};

const markBooted = (): void => {
  try {
    globalThis.sessionStorage.setItem(BOOT_FLAG, '1');
  } catch {
    // Without storage the boot screen simply shows again on the next load.
  }
};

export interface StageAppProps extends StageRegistry {
  /** Injected randomness in [0, 1); defaults to Math.random. */
  draw?: () => number;
  /** Injected clock; defaults to Date.now. */
  now?: () => number;
}

interface OpenEvent {
  eventId: string;
  /** The host who opened it, kept if the session ends while the show is on (FR-007). */
  user: AuthUser;
}

/**
 * The stage entry point (`/`): boot screen once per browser session, then the auth gate, the event
 * list, and the event stage. Services come from `useAppServices()`.
 */
export const StageApp = ({ games, screens, draw = Math.random, now = Date.now }: StageAppProps) => {
  const { data, mode } = useAppServices();
  const [booted, setBooted] = useState(readBooted);
  const [open, setOpen] = useState<OpenEvent | null>(null);
  const auth = useAuthSession(data, mode === 'demo');

  if (!booted) {
    return (
      <BootScreen
        onDone={() => {
          markBooted();
          setBooted(true);
        }}
      />
    );
  }

  const signedInUser = auth.state.status === 'signedIn' ? auth.state.user : null;

  let body;
  if (open) {
    body = (
      <EventStage
        key={open.eventId}
        eventId={open.eventId}
        user={signedInUser ?? open.user}
        signedOut={signedInUser === null}
        onExit={() => {
          setOpen(null);
        }}
        onSignOut={() => {
          void data.auth.signOut();
        }}
        games={games}
        screens={screens}
        draw={draw}
        now={now}
      />
    );
  } else if (auth.state.status === 'loading') {
    body = (
      <main className={styles.center}>
        <Panel>
          <p role="status">Loading...</p>
        </Panel>
      </main>
    );
  } else if (signedInUser) {
    body = (
      <EventsScreen
        data={data}
        user={signedInUser}
        onOpen={(eventId) => {
          setOpen({ eventId, user: signedInUser });
        }}
        onSignOut={() => {
          void data.auth.signOut();
        }}
      />
    );
  } else {
    body = <AuthScreen auth={data.auth} onDemoSignIn={mode === 'demo' ? auth.signInAsDemoHost : undefined} />;
  }

  return <ErrorBoundary recoverLabel="Reload this screen">{body}</ErrorBoundary>;
};
