import { useCallback, useState } from 'react';
import { Badge, Button, Inset, Panel } from '@/design';
import type { DataLayer } from '@/data';
import { currentSnapshotKind, type HostClient } from './hostClient';
import type { HostCommandInput, HostSend } from './hostProtocol';
import { describeResult } from './describeResult';
import { HostConsoleFor } from './HostConsoleFor';
import { SettingsDialog } from './SettingsDialog';
import { StageSnapshotPanel } from './StageSnapshotPanel';
import { useAppSettings } from './useAppSettings';
import { useBuzzHotkeys } from './useBuzzHotkeys';
import { useHostClientState } from './useHostClient';
import styles from './HostPage.module.css';

export interface HostSessionProps {
  client: HostClient;
  code: string;
  data: Pick<DataLayer, 'auth' | 'settings'>;
  /** Warnings from connecting (for example "realtime is unavailable"). */
  notes: string[];
}

/** The connected host view: live stage snapshot on the left, the console for what is on screen on the right. */
export const HostSession = ({ client, code, data, notes }: HostSessionProps) => {
  const state = useHostClientState(client);
  const { settings, update } = useAppSettings(data);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [feedback, setFeedback] = useState('');

  const send: HostSend = useCallback(
    async (command: HostCommandInput) => {
      const result = await client.send(command);
      setFeedback(describeResult(command, result));
      return result;
    },
    [client],
  );

  useBuzzHotkeys(!settingsOpen, (team) => {
    void send({ target: 'hub', name: 'buzz', teamId: team });
  });

  const kind = currentSnapshotKind(state);
  const snapshot = kind === null ? null : (state.snapshots[kind] ?? null);
  const hub = state.snapshots.hub ?? null;

  return (
    <main className={styles.page}>
      <div className={styles.bar}>
        <h1 className={styles.title}>Host view</h1>
        <div className={styles.row}>
          <Badge tone="host">Room {code}</Badge>
          {state.connectionState === 'live' ? <Badge tone="confirm">Connected</Badge> : null}
          {state.connectionState === 'looking' ? <Badge tone="gold">Looking for the stage…</Badge> : null}
          <Button
            variant="tertiary"
            onClick={() => {
              setSettingsOpen(true);
            }}
          >
            Settings
          </Button>
        </div>
      </div>

      {state.connectionState === 'lost' ? (
        <p className={styles.banner} role="alert">
          Lost contact with the stage. Check that the game window is open and awake; this page keeps trying.
        </p>
      ) : null}
      {notes.map((note) => (
        <p key={note} className={styles.note}>
          {note}
        </p>
      ))}

      <div className={styles.columns}>
        <Panel aria-label="Stage snapshot">
          <h2 className={styles.heading}>On the stage</h2>
          <StageSnapshotPanel hub={hub} />
        </Panel>
        <Panel aria-label="Host console">
          <h2 className={styles.heading}>Console</h2>
          {snapshot?.inputLocked === true ? (
            <Inset>
              <p className={styles.note}>The game is paused or showing a dialog; commands are ignored.</p>
            </Inset>
          ) : null}
          <HostConsoleFor kind={kind ?? 'hub'} snapshot={snapshot} send={send} />
          <p className={styles.feedback} role="status" aria-live="polite">
            {feedback}
          </p>
        </Panel>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
        }}
        settings={settings}
        onChange={(patch) => {
          update(patch);
          if (patch.showMode !== undefined) {
            void send({ target: 'hub', name: 'show-mode', args: { on: patch.showMode } });
          }
        }}
        roomCode={code}
        onResetScores={() => {
          void send({ target: 'hub', name: 'reset-scores' });
        }}
        onSignOut={() => {
          void data.auth.signOut();
        }}
      />
    </main>
  );
};
