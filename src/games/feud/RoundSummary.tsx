import type { RoundHow } from '@/engines/feud/types';
import { NumberDisplay } from '@/design/NumberDisplay';
import type { FeudViewModel } from './types';
import styles from './RoundSummary.module.css';

const HOW: Record<RoundHow, string> = {
  cleared: 'cleared the board',
  'steal-success': 'stole the bank',
  'steal-fail': 'kept the bank after a failed steal',
  'sudden-death': 'gave the top answer',
};

export interface RoundSummaryProps {
  view: FeudViewModel;
}

/** The round is decided: who takes the bank, then the rest of the board is shown bottom-up. */
export const RoundSummary = ({ view }: RoundSummaryProps) => {
  const result = view.audience.roundResult;
  if (result === null) return null;
  const name = view.teams[result.winner].name;
  const revealing = view.audience.phase === 'round-decided';
  return (
    <section className={styles.summary} aria-live="polite">
      <p className={styles.headline}>
        {name} {HOW[result.how]}
      </p>
      <p className={styles.award}>
        <NumberDisplay value={result.bank} size="lg" prefix="+" />
        <span className={styles.suffix}>points</span>
      </p>
      <p className={styles.detail}>{revealing ? "Let's see what else was on the board" : 'Round complete'}</p>
    </section>
  );
};
