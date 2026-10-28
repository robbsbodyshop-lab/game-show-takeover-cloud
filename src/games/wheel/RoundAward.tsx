import type { AudienceView } from '@/engines/wheel/selectors';
import type { Award } from '@/engines/wheel/types';
import { Button, Panel } from '@/design';
import { money } from './format';
import styles from './RoundAward.module.css';

export interface RoundAwardProps {
  award: Award;
  view: AudienceView;
  /** "On to Round 2" and the like (presentation.ts). */
  continueLabel: string | null;
  showButtons: boolean;
  onContinue: () => void;
}

/** The round award card: who banked what, then the way on (FR-040, inventory 1.5 step 3). */
export const RoundAward = ({ award, view, continueLabel, showButtons, onContinue }: RoundAwardProps) => {
  const team = view.teams.find((t) => t.id === award.team);
  const speedUp = award.speedUp;
  return (
    <Panel className={styles.card} role="status" data-testid="round-award">
      <h2 className={styles.title}>
        {team ? (speedUp ? 'SPEED-UP SOLVED!' : 'SOLVED!') : 'NO ONE SOLVED IT'}
      </h2>
      {team ? (
        <>
          <p className={styles.winner}>{team.name}</p>
          <p className={styles.amount}>BANKS {money(award.amount)}</p>
          {award.prizes.length > 0 ? (
            <p className={styles.prizes}>PRIZES: {award.prizes.map((p) => p.name).join(', ')}</p>
          ) : null}
        </>
      ) : (
        <p className={styles.prizes}>Round cash and prizes go back to the wheel.</p>
      )}
      {continueLabel && showButtons ? (
        <Button variant="primary" size="lg" onClick={onContinue}>
          {continueLabel} (Enter)
        </Button>
      ) : null}
      {continueLabel && !showButtons ? <p className={styles.next}>{continueLabel}</p> : null}
    </Panel>
  );
};
