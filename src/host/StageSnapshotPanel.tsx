import { Badge, Inset, Label } from '@/design';
import type { HostSnapshot } from './hostProtocol';
import { formatClock, readHubData, type HubClock } from './hubSnapshot';
import { useNow } from './useNow';
import styles from './StageSnapshotPanel.module.css';

export interface StageSnapshotPanelProps {
  /** The hub snapshot; null until the stage has sent one. */
  hub: HostSnapshot | null;
}

const clockMs = (clock: HubClock, paused: boolean, now: number): number | null => {
  if (!paused && clock.endsAt !== null) return clock.endsAt - now;
  return clock.remainingMs;
};

/** Left column of the host view: what the projector shows, in text (FR-013). */
export const StageSnapshotPanel = ({ hub }: StageSnapshotPanelProps) => {
  const data = readHubData(hub?.data);
  const running = hub !== null && !data.paused && data.clocks.some((c) => c.endsAt !== null);
  const now = useNow(running);

  if (hub === null) {
    return <p role="status">Waiting for the stage to send its first snapshot…</p>;
  }

  return (
    <div className={styles.root}>
      {data.gameVisible ? null : (
        <p className={styles.warning} role="alert">
          The game page is hidden (background tab or minimised). Clocks and phones may stall; bring it back to
          the front.
        </p>
      )}

      <div className={styles.head}>
        <span className={styles.phase}>{data.phase === '' ? 'Stage' : data.phase}</span>
        {data.paused ? <Badge tone="orange">Paused</Badge> : null}
        {data.showMode ? <Badge tone="info">Show mode</Badge> : null}
        {hub.inputLocked ? <Badge tone="gold">Input locked</Badge> : null}
        {data.roomCode === null ? null : <Badge tone="host">Room {data.roomCode}</Badge>}
      </div>

      <div>
        <Label>Scores and chips</Label>
        <Inset>
          {data.teams.length === 0 ? (
            <p>No teams yet.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Team</th>
                  <th scope="col" className={styles.num}>
                    Score
                  </th>
                  <th scope="col" className={styles.num}>
                    Chips
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.teams.map((team) => (
                  <tr key={team.id}>
                    <th scope="row">
                      <span className={styles.swatch} style={{ backgroundColor: team.color }} />
                      {team.id}. {team.name}
                    </th>
                    <td className={styles.num}>{team.score}</td>
                    <td className={styles.num}>{team.chips}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Inset>
      </div>

      {data.clocks.length === 0 ? null : (
        <div>
          <Label>Clocks</Label>
          <Inset>
            <ul className={styles.list}>
              {data.clocks.map((clock) => {
                const ms = clockMs(clock, data.paused, now);
                return (
                  <li key={clock.id || clock.label}>
                    {clock.label}{' '}
                    <span className={styles.clock}>{ms === null ? '--:--' : formatClock(ms)}</span>
                    {data.paused ? ' (held)' : null}
                  </li>
                );
              })}
            </ul>
          </Inset>
        </div>
      )}

      {data.playOrder === null ? null : (
        <div>
          <Label>Play order</Label>
          <p>{data.playOrder.join(' → ')}</p>
        </div>
      )}

      <div>
        <Label>Phones connected ({data.roster.length})</Label>
        {data.roster.length === 0 ? (
          <p>None yet.</p>
        ) : (
          <ul className={styles.list}>
            {data.roster.map((entry, index) => (
              // Two phones can share a team and a nickname, so the position is part of the key.
              <li key={`${String(entry.team)}-${entry.nickname}-${String(index)}`}>
                <Badge>{entry.team}</Badge> {entry.nickname === '' ? 'Player' : entry.nickname}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
