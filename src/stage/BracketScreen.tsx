import { Button, Marquee, Panel, Stripes } from '@/design';
import { nextBracketMatch, teamById, type EventAction, type EventSession } from '@/engines/event';
import styles from './BracketScreen.module.css';

export interface BracketScreenProps {
  session: EventSession;
  dispatch: (action: EventAction) => void;
  draw: () => number;
  onBackToHub: () => void;
}

/**
 * Between two Family Feud matches of a 3+ team bracket (FR-032): the bracket so far and a button
 * that starts the next match. (The first match starts from the hub tile.)
 */
export const BracketScreen = ({ session, dispatch, draw, onBackToHub }: BracketScreenProps) => {
  const next = nextBracketMatch(session);
  const nameOf = (id: number | null): string => (id === null ? 'bye' : (teamById(session, id)?.name ?? '?'));
  return (
    <main className={styles.screen}>
      <Marquee as="h1">Family Feud bracket</Marquee>
      <Stripes />
      <div className={styles.rounds}>
        {session.bracket?.rounds.map((round, r) => (
          <Panel key={r} className={styles.round}>
            <h2 className={styles.roundTitle}>Round {r + 1}</h2>
            <ul className={styles.matches}>
              {round.map((match) => (
                <li
                  key={`${String(match.round)}-${String(match.slot)}`}
                  className={styles.match}
                  data-current={next?.round === match.round && next.slot === match.slot}
                >
                  <span>
                    {nameOf(match.a)} vs {nameOf(match.b)}
                  </span>
                  {match.winner === null ? null : (
                    <span className={styles.winner}>Won: {nameOf(match.winner)}</span>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
      <div className={styles.actions}>
        {next ? (
          <Button
            variant="confirm"
            size="lg"
            onClick={() => {
              dispatch({ type: 'START_GAME', kind: 'feud', instanceSeed: Math.floor(draw() * 2 ** 31) });
            }}
          >
            Start {next.a.name} vs {next.b.name}
          </Button>
        ) : null}
        <Button variant="secondary" size="lg" onClick={onBackToHub}>
          Back to hub
        </Button>
      </div>
    </main>
  );
};
