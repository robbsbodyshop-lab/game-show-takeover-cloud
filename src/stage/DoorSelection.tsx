import { useState } from 'react';
import { Badge, Button, Marquee, Panel, Stripes } from '@/design';
import type { EventAction, EventSession } from '@/engines/event';
import { Door } from './Door';
import styles from './DoorSelection.module.css';

export interface DoorSelectionProps {
  session: EventSession;
  dispatch: (action: EventAction) => void;
  /** Injected randomness in [0, 1); one number per door goes into `DOORS_REVEAL`. */
  draw: () => number;
}

/**
 * Door game (HOST_FEATURE_INVENTORY.md 1.2, FR-050): every team picks a door, the draw decides the
 * play order behind them, and the doors open one after another. The host clicks for the team whose
 * turn it is (the next team without a pick, or any team chosen from the list).
 */
export const DoorSelection = ({ session, dispatch, draw }: DoorSelectionProps) => {
  const doors = session.doors;
  const [chosen, setChosen] = useState<number | null>(null);
  if (!doors) return null;

  const picks = new Map(doors.picks.map((p) => [p.door, p.team]));
  const pickedBy = new Map(doors.picks.map((p) => [p.team, p.door]));
  const nextUnpicked = session.teams.find((t) => !pickedBy.has(t.id))?.id ?? null;
  const picker = session.teams.find((t) => t.id === (chosen ?? nextUnpicked)) ?? null;
  const picking = doors.stage === 'picking';

  const pick = (door: number): void => {
    if (!picking || !picker) return;
    dispatch({ type: 'DOOR_PICK', team: picker.id, door });
    setChosen(null);
  };

  const reveal = (): void => {
    dispatch({ type: 'DOORS_REVEAL', draw: Array.from({ length: doors.doorCount }, () => draw()) });
  };

  const order = doors.positions
    ? (session.playOrder ?? [])
        .map((id) => session.teams.find((t) => t.id === id))
        .filter((t) => t !== undefined)
    : [];

  return (
    <main className={styles.screen}>
      <Marquee as="h1">Pick a door</Marquee>
      <Stripes />
      <p className={styles.prompt} role="status">
        {picking && picker ? `${picker.name}, choose your door` : null}
        {doors.stage === 'revealing' ? 'Every team has picked. Open the doors!' : null}
        {doors.stage === 'done' ? 'The play order is set.' : null}
      </p>

      <div className={styles.teams} role="group" aria-label="Teams">
        {session.teams.map((team) => {
          const door = pickedBy.get(team.id);
          return (
            <button
              key={team.id}
              type="button"
              className={styles.team}
              data-active={picking && picker?.id === team.id}
              style={{ borderColor: team.color }}
              disabled={!picking}
              aria-label={`${team.name}${door === undefined ? ', no door yet' : `, door ${String(door)}`}`}
              onClick={() => {
                setChosen(team.id);
              }}
            >
              <span>{team.name}</span>
              <Badge tone={door === undefined ? 'cream' : 'confirm'}>
                {door === undefined ? '?' : `Door ${String(door)}`}
              </Badge>
            </button>
          );
        })}
      </div>

      <div className={styles.doors} role="group" aria-label="Doors">
        {Array.from({ length: doors.doorCount }, (_, i) => i + 1).map((number) => {
          const holderId = picks.get(number);
          const position = doors.positions?.[number - 1] ?? null;
          return (
            <Door
              key={number}
              number={number}
              holder={session.teams.find((t) => t.id === holderId)}
              position={position}
              order={position === null ? 0 : position - 1}
              disabled={!picking || (holderId !== undefined && holderId !== picker?.id)}
              onPick={() => {
                pick(number);
              }}
            />
          );
        })}
      </div>

      <div className={styles.footer}>
        {doors.stage === 'revealing' ? (
          <Button variant="primary" size="lg" onClick={reveal}>
            Open the doors!
          </Button>
        ) : null}
        {doors.stage === 'done' ? (
          <>
            <Panel className={styles.order}>
              <ol aria-label="Play order">
                {order.map((team) => (
                  <li key={team.id} style={{ color: team.color }}>
                    <span className={styles.orderName}>{team.name}</span>
                  </li>
                ))}
              </ol>
            </Panel>
            <Button
              variant="confirm"
              size="lg"
              onClick={() => {
                dispatch({ type: 'GO_HUB' });
              }}
            >
              Continue to the hub
            </Button>
          </>
        ) : null}
      </div>
    </main>
  );
};
