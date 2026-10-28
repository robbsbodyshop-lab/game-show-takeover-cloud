import { Marquee } from '@/design/Marquee';
import { Panel } from '@/design/Panel';
import { faceOffIndex, podiumName } from './labels';
import type { FeudViewModel } from './types';
import styles from './MatchCard.module.css';

export interface SuddenDeathCardProps {
  view: FeudViewModel;
}

/** Nobody has the points after round 4: one question, the top answer only (rules, Main game 8). */
export const SuddenDeathCard = ({ view }: SuddenDeathCardProps) => {
  const { audience } = view;
  return (
    <Panel className={styles.card}>
      <Marquee as="h1">Sudden Death</Marquee>
      <p className={styles.rule}>Triple points. Top answer only.</p>
      <div className={styles.versus}>
        {(['A', 'B'] as const).map((side) => (
          <div key={side} className={styles.family}>
            <span className={styles.name}>{podiumName(view, side, faceOffIndex(view, side))}</span>
            <span className={styles.note}>{view.teams[side].name}</span>
          </div>
        ))}
      </div>
      <p className={styles.note}>
        {audience.events.some((e) => e.type === 'SUDDEN_DEATH_READY' && e.retry && e.seq === audience.seq - 1)
          ? 'Nobody gave the top answer. A new question is coming.'
          : 'Whoever gives the number one answer wins the game.'}
      </p>
    </Panel>
  );
};
