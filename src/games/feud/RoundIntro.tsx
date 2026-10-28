import { Marquee } from '@/design/Marquee';
import { Panel } from '@/design/Panel';
import { faceOffIndex, multiplierLabel, podiumName } from './labels';
import type { FeudViewModel } from './types';
import styles from './MatchCard.module.css';

export interface RoundIntroProps {
  view: FeudViewModel;
}

/** "Give me ..." for the next face-off, shown before the survey is loaded (after Undo, or a slow start). */
export const RoundIntro = ({ view }: RoundIntroProps) => {
  const { audience } = view;
  return (
    <Panel className={styles.card}>
      <Marquee as="h1">{`Round ${audience.round.toString()}`}</Marquee>
      <p className={styles.rule}>{multiplierLabel(audience.multiplier, false)}</p>
      <div className={styles.versus}>
        {(['A', 'B'] as const).map((side) => (
          <div key={side} className={styles.family}>
            <span className={styles.name}>Give me {podiumName(view, side, faceOffIndex(view, side))}</span>
            <span className={styles.note}>{view.teams[side].name}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
};
