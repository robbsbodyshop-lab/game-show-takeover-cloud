import { useState } from 'react';
import { Button, Marquee, Panel, Stripes } from '@/design';
import type { EventAction, EventSession, TeamEdit } from '@/engines/event';
import type { ConnectionStatus, PresenceEntry } from '@/realtime';
import { editsFromTeams } from './editsFromTeams';
import { JoinPanel } from './JoinPanel';
import { TeamEditor } from './TeamEditor';
import { validateTeamEdits } from './teamsValidation';
import styles from './SetupScreen.module.css';

export interface SetupScreenProps {
  eventName: string;
  session: EventSession;
  dispatch: (action: EventAction) => void;
  roomCode: string | null;
  origin: string;
  status: ConnectionStatus;
  roomError: string | null;
  roster: readonly PresenceEntry[];
  showMode: boolean;
  onOpenSettings: () => void;
  onExitEvent: () => void;
}

/**
 * Setup (HOST_FEATURE_INVENTORY.md 1.1): teams, QR code, room code, connected phones, Start.
 * A valid edit is saved to the event at once so phones see the real team names while they join;
 * an invalid draft (duplicate or empty name) stays local and blocks Start.
 */
export const SetupScreen = ({
  eventName,
  session,
  dispatch,
  roomCode,
  origin,
  status,
  roomError,
  roster,
  showMode,
  onOpenSettings,
  onExitEvent,
}: SetupScreenProps) => {
  const [draft, setDraft] = useState<TeamEdit[]>(() => editsFromTeams(session.teams));
  const validation = validateTeamEdits(draft);
  const needsDoors = session.teams.length >= 3 && session.playOrder === null;

  const change = (next: TeamEdit[]): void => {
    setDraft(next);
    if (validateTeamEdits(next).ok) dispatch({ type: 'SET_TEAMS', teams: next });
  };

  const start = (): void => {
    if (!validation.ok) return;
    dispatch({ type: needsDoors ? 'START_DOORS' : 'GO_HUB' });
  };

  return (
    <main className={styles.setup}>
      <header className={styles.header}>
        <Marquee as="h1">{eventName}</Marquee>
        <Stripes />
      </header>
      <div className={styles.body}>
        <Panel className={styles.teams}>
          <h2 className={styles.heading}>Teams</h2>
          <TeamEditor value={draft} validation={validation} onChange={change} />
          <div className={styles.start}>
            <Button variant="confirm" size="lg" disabled={!validation.ok} onClick={start}>
              Start Game!
            </Button>
            <span className={styles.hint}>
              {needsDoors ? 'Three or more teams pick doors first.' : 'On to the hub.'}
            </span>
            {showMode ? null : (
              <div className={styles.host}>
                <Button variant="host" size="sm" onClick={onOpenSettings}>
                  Settings
                </Button>
                <Button variant="quiet" size="sm" onClick={onExitEvent}>
                  Back to my events
                </Button>
              </div>
            )}
          </div>
        </Panel>
        <JoinPanel
          code={roomCode}
          origin={origin}
          status={status}
          error={roomError}
          teams={session.teams}
          roster={roster}
        />
      </div>
    </main>
  );
};
