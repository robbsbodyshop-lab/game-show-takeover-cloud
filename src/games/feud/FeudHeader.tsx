import { NumberDisplay } from '@/design/NumberDisplay';
import { multiplierLabel } from './labels';
import type { FeudViewModel } from './types';
import styles from './FeudHeader.module.css';

export interface FeudHeaderProps {
  view: FeudViewModel;
}

/** Round and multiplier on the left, the question in the middle, the bank on the right. */
export const FeudHeader = ({ view }: FeudHeaderProps) => {
  const { audience } = view;
  const ready = audience.faceOff?.stage === 'ready';
  return (
    <header className={styles.header}>
      <div className={styles.round}>
        <span className={styles.roundLabel}>
          {audience.suddenDeath ? 'FINAL' : `ROUND ${audience.round.toString()}`}
        </span>
        <span className={styles.multiplier}>
          {multiplierLabel(audience.multiplier, audience.suddenDeath)}
        </span>
        {view.matchLabel !== null && <span className={styles.match}>{view.matchLabel}</span>}
      </div>
      <h1 className={styles.question}>
        {ready
          ? `Top ${audience.board.length.toString()} answers on the board`
          : (audience.question ?? 'Survey says...')}
      </h1>
      <div className={styles.bank} aria-label="Bank">
        <span className={styles.bankLabel}>BANK</span>
        <NumberDisplay value={audience.bank} size="lg" />
      </div>
    </header>
  );
};
