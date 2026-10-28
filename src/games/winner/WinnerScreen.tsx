import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { AudioPlayer } from '@/audio/player';
import { Badge, Button, Inset, Label, Marquee, NumberDisplay, Panel, Stripes } from '@/design';
import { leaders, standings, type EventAction, type EventSession } from '@/engines/event';
import { HostZone } from '../speed/HostZone';
import { useTwoTap } from '../speed/useTwoTap';
import { Sparkles } from './Sparkles';
import styles from './WinnerScreen.module.css';

export interface WinnerScreenProps {
  session: EventSession;
  dispatch: (action: EventAction) => void;
  /** While true (pause, a dialog) the fanfare waits and the buttons do nothing. */
  inputLocked: boolean;
  showMode: boolean;
  audio: AudioPlayer;
  /** Accepted for a uniform stage wiring; the winner screen has no clock. */
  now?: () => number;
  /** Accepted for a uniform stage wiring; the winner screen has no randomness. */
  draw?: () => number;
}

/**
 * Announce the Winner (FR-054, HOST_FEATURE_INVENTORY.md 1.6): fanfare once, marquee, the champion huge in
 * its colour and the final standings. A tie for first names every leader and the table shares the rank.
 */
export const WinnerScreen = ({ session, dispatch, inputLocked, showMode, audio }: WinnerScreenProps) => {
  const table = standings(session);
  const champions = leaders(session);
  const tied = champions.length > 1;

  const fanfared = useRef(false);
  useEffect(() => {
    if (fanfared.current || inputLocked) return;
    fanfared.current = true;
    audio.play('winner_fanfare');
  }, [inputLocked, audio]);

  // A held Enter or Space must not tap through the winner card (HOST_FEATURE_INVENTORY.md 2.1).
  const held = useRef(false);
  const guardKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.repeat) {
      held.current = true;
      event.preventDefault();
    }
  };
  const guardKeyUp = () => {
    setTimeout(() => {
      held.current = false;
    }, 0);
  };
  const unlessHeld = (fn: () => void) => () => {
    if (!inputLocked && !held.current) fn();
  };

  const newEvent = useTwoTap(() => {
    dispatch({ type: 'NEW_EVENT' });
  });

  return (
    <section className={styles.screen} data-testid="winner-screen">
      <Sparkles />
      <Marquee as="h1" className={styles.title}>
        {tied ? 'IT IS A TIE' : 'AND THE WINNER IS'}
      </Marquee>
      <Stripes />

      <div className={styles.champions} data-testid="champion" data-count={champions.length}>
        {champions.length === 0 && <p className={styles.noTeams}>No teams</p>}
        {champions.map((team) => (
          <h2
            key={team.id}
            className={styles.champion}
            style={{ color: team.color }}
            data-testid="champion-name"
            data-team={team.id}
          >
            {team.name}
          </h2>
        ))}
        {champions[0] && (
          <NumberDisplay size="xl" value={champions[0].score} className={styles.championScore} />
        )}
      </div>

      <Panel className={styles.standings}>
        <Label>Final standings</Label>
        <table className={styles.table} aria-label="Final standings">
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Team</th>
              <th scope="col">Score</th>
            </tr>
          </thead>
          <tbody>
            {table.map(({ team, rank }) => {
              const shared = table.filter((x) => x.rank === rank).length > 1;
              return (
                <tr key={team.id} data-testid={`standing-${team.id.toString()}`} data-rank={rank}>
                  <td className={styles.rank}>
                    <span data-testid={`rank-${team.id.toString()}`}>{rank}</span>
                    {shared && <Badge tone="gold">Tie</Badge>}
                  </td>
                  <td>
                    <span className={styles.swatch} style={{ backgroundColor: team.color }} />
                    {team.name}
                  </td>
                  <td className={styles.score}>{team.score}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <HostZone showMode={showMode} className={styles.host}>
        <Inset className={styles.buttons}>
          <Button
            variant="secondary"
            disabled={inputLocked}
            onKeyDown={guardKeyDown}
            onKeyUp={guardKeyUp}
            onClick={unlessHeld(() => {
              dispatch({ type: 'GO_HUB' });
            })}
          >
            Back to hub
          </Button>
          <Button
            variant={newEvent.armed ? 'danger' : 'host'}
            disabled={inputLocked}
            onKeyDown={guardKeyDown}
            onKeyUp={guardKeyUp}
            onClick={unlessHeld(newEvent.press)}
          >
            {newEvent.armed ? 'Tap again: end this event' : 'Start new event'}
          </Button>
        </Inset>
      </HostZone>
    </section>
  );
};
