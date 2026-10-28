import type { AudienceView } from '@/engines/wheel/selectors';
import { Badge, NumberDisplay, Panel } from '@/design';
import { ClockBar } from './ClockBar';
import type { ClockSnapshot } from './hostData';
import { money } from './format';
import styles from './TossUp.module.css';

export interface TossUpProps {
  view: AudienceView;
  clock: ClockSnapshot | null;
}

const TITLE: Record<string, string> = {
  tossup: 'TOSS-UP',
  frenzy: 'FORTUNE FRENZY',
  triple: 'TRIPLE TOSS-UP',
  tiebreak: 'TIEBREAKER',
};

/**
 * The toss-up side panel (FR-040): what the puzzle is worth, who rang in, who is locked out, the
 * Frenzy clock and how many Frenzy puzzles are solved. It never shows an answer.
 */
export const TossUp = ({ view, clock }: TossUpProps) => {
  const buzzed = view.teams.find((t) => t.id === view.buzzed);
  const locked = view.teams.filter((t) => t.lockedOut);
  const ready = view.board?.some((row) => row.some((c) => c.kind === 'tile' && c.lit)) ?? false;
  return (
    <Panel className={styles.panel} data-testid="tossup" data-phase={view.phase}>
      <h2 className={styles.title}>{TITLE[view.stage] ?? 'TOSS-UP'}</h2>
      <NumberDisplay value={view.tossupValue ?? 0} prefix="$" size="xl" className={styles.value} />
      {view.stage === 'frenzy' ? <ClockBar clock={clock} /> : null}
      {view.triple ? (
        <p className={styles.line}>
          PUZZLE {view.triple.index + 1} OF 3
          <span className={styles.dots}>
            {view.triple.solvers.map((s, i) => (
              <Badge key={i} tone={s === null ? 'cream' : 'confirm'}>
                {s === null ? '-' : (view.teams.find((t) => t.id === s)?.name ?? '?')}
              </Badge>
            ))}
          </span>
        </p>
      ) : null}
      <p className={styles.status} role="status">
        {buzzed
          ? `${buzzed.name} RANG IN!`
          : view.phase === 'tossup-done'
            ? 'TOSS-UP OVER'
            : ready
              ? 'RING IN TO ANSWER'
              : 'WATCH THE BOARD'}
      </p>
      {locked.length > 0 ? (
        <p className={styles.line}>LOCKED OUT: {locked.map((t) => t.name).join(', ')}</p>
      ) : null}
      {view.stage === 'tiebreak' ? (
        <p className={styles.line}>Tied for first. Winner takes {money(view.tossupValue ?? 1000)}.</p>
      ) : null}
    </Panel>
  );
};
