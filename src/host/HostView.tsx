/**
 * `/host`: sign in, pick a room, attach as a host view and show the live stage next to the console
 * (FR-013, FR-018). A normal responsive page, not the 1920x1080 stage.
 */
import { useState } from 'react';
import { useAppServices } from '@/app/AppContext';
import { isValidRoomCode, normalizeRoomCode } from '@/data';
import { Panel } from '@/design';
import { HostSession } from './HostSession';
import { HostSignIn } from './HostSignIn';
import { RoomCodeForm } from './RoomCodeForm';
import { useHostAuth } from './useHostAuth';
import { useHostConnection } from './useHostConnection';
import styles from './HostPage.module.css';

const roomFromUrl = (): string | null => {
  const raw = new URLSearchParams(window.location.search).get('room');
  if (raw === null) return null;
  const code = normalizeRoomCode(raw);
  return isValidRoomCode(code) ? code : null;
};

const newHostId = (): string =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `host-${Math.random().toString(36).slice(2, 12)}`;

const rememberRoom = (code: string): void => {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('room', code);
    window.history.replaceState(null, '', url);
  } catch {
    // The address bar is a convenience only.
  }
};

export const HostView = () => {
  const { data, createTransport } = useAppServices();
  const auth = useHostAuth(data);
  const [code, setCode] = useState<string | null>(roomFromUrl);
  const [hostId] = useState(newHostId);
  const connection = useHostConnection({
    data,
    createTransport,
    code: auth === 'signed-in' ? code : null,
    hostId,
  });

  if (auth === 'loading') {
    return (
      <main className={styles.page}>
        <p role="status">Checking sign-in…</p>
      </main>
    );
  }
  if (auth === 'signed-out') return <HostSignIn auth={data.auth} />;

  const signOut = () => {
    void data.auth.signOut();
  };

  if (code === null) {
    return (
      <RoomCodeForm
        onSubmit={(next) => {
          rememberRoom(next);
          setCode(next);
        }}
        onSignOut={signOut}
      />
    );
  }

  if (connection.phase === 'error') {
    return (
      <RoomCodeForm
        error={connection.message}
        onSubmit={(next) => {
          rememberRoom(next);
          setCode(next);
        }}
        onSignOut={signOut}
      />
    );
  }

  if (connection.phase === 'joining') {
    return (
      <main className={styles.page}>
        <Panel className={styles.gate}>
          <p role="status">Joining room {code}…</p>
        </Panel>
      </main>
    );
  }

  return <HostSession client={connection.client} code={code} data={data} notes={connection.notes} />;
};
