import { Button, Inset, Label } from '@/design';
import type { HostConsoleProps } from './consoleRegistry';
import { readHubData } from './hubSnapshot';
import { useTwoTap } from './useTwoTap';
import styles from './HubConsole.module.css';

const TEAM_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/** Event-level controls that work on every screen: pause, show mode, buzz for a team, leave the game. */
export const HubConsole = ({ snapshot, send }: HostConsoleProps) => {
  const hub = readHubData(snapshot.data);
  const { armed, press } = useTwoTap(() => {
    void send({ target: 'hub', name: 'quit-game' });
  });
  const known = new Set(hub.teams.map((t) => t.id));

  return (
    <div className={styles.root}>
      <div className={styles.group}>
        <Label>Event</Label>
        <div className={styles.row}>
          <Button
            variant={hub.paused ? 'confirm' : 'secondary'}
            onClick={() => {
              void send({ target: 'hub', name: hub.paused ? 'resume' : 'pause' });
            }}
          >
            {hub.paused ? 'Resume game' : 'Stand by (pause)'}
          </Button>
          <Button
            variant="tertiary"
            aria-pressed={hub.showMode}
            onClick={() => {
              void send({ target: 'hub', name: 'show-mode', args: { on: !hub.showMode } });
            }}
          >
            {hub.showMode ? 'Show mode: on' : 'Show mode: off'}
          </Button>
        </div>
      </div>

      <div className={styles.group}>
        <Label>Buzz for a team (keys 1-8)</Label>
        <Inset>
          <div className={styles.row}>
            {TEAM_SLOTS.map((id) => (
              <Button
                key={id}
                className={styles.buzz}
                variant="primary"
                aria-label={`Buzz team ${String(id)}`}
                disabled={known.size > 0 && !known.has(id)}
                onClick={() => {
                  void send({ target: 'hub', name: 'buzz', teamId: id });
                }}
              >
                {id}
              </Button>
            ))}
          </div>
        </Inset>
      </div>

      <div className={styles.group}>
        <Label>Leave the game</Label>
        <div className={styles.row}>
          <Button variant="danger" disabled={hub.activeGame === null} onClick={press}>
            {armed ? 'Tap again: abandon, no scores' : 'Quit game, back to the hub'}
          </Button>
        </div>
      </div>
    </div>
  );
};
