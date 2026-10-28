import type { AudienceView } from '@/engines/wheel/selectors';
import { Panel } from '@/design';
import { money } from './format';
import styles from './TiebreakerCard.module.css';

export interface TiebreakerCardProps {
  view: AudienceView;
}

/** Shown while the tiebreaker toss-up is on: who is tied for first and what it is worth. */
export const TiebreakerCard = ({ view }: TiebreakerCardProps) => {
  const top = Math.max(...view.teams.map((t) => t.bank));
  const tied = view.teams.filter((t) => t.bank === top);
  return (
    <Panel className={styles.card} role="status" data-testid="tiebreaker-card">
      <h2 className={styles.title}>TIEBREAKER</h2>
      <p className={styles.line}>
        {tied.map((t) => t.name).join(' and ')} are tied at {money(top)}.
      </p>
      <p className={styles.line}>
        One toss-up for {money(view.tossupValue ?? 1000)}. Only the tied teams may ring in.
      </p>
    </Panel>
  );
};
