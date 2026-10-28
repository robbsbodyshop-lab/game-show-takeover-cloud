import type { CSSProperties } from 'react';
import { NumberDisplay } from '@/design/NumberDisplay';
import type { FeudTeamInfo } from './types';
import styles from './FamilyScoreBox.module.css';

export interface FamilyScoreBoxProps {
  team: FeudTeamInfo;
  score: number;
  /** This family has the board. */
  inControl: boolean;
  /** Strikes against the family in control (0-3); shown only while it has control. */
  strikes: number;
  /** Name of the player answering now, if it is this family's turn. */
  answeringName: string | null;
  /** This family is the one stealing. */
  stealing: boolean;
}

/** A family's score, colour band, strikes and whose turn it is. Team colour always has an ink outline. */
export const FamilyScoreBox = ({
  team,
  score,
  inControl,
  strikes,
  answeringName,
  stealing,
}: FamilyScoreBoxProps) => (
  <section
    className={styles.box}
    style={{ '--team': team.color } as CSSProperties}
    data-control={inControl ? 'true' : 'false'}
    data-answering={answeringName === null ? 'false' : 'true'}
    aria-label={`${team.name} score`}
  >
    <div className={styles.band} />
    <h2 className={styles.name}>{team.name}</h2>
    <NumberDisplay value={score} size="xl" />
    <div className={styles.strikes} aria-label={`${strikes.toString()} strikes`}>
      {[1, 2, 3].map((n) => (
        <span key={n} className={styles.strike} data-lit={inControl && strikes >= n ? 'true' : 'false'}>
          X
        </span>
      ))}
    </div>
    <div className={styles.status} role="status">
      {stealing ? 'STEALING' : inControl ? 'IN CONTROL' : ''}
      {answeringName !== null && <span className={styles.player}>{answeringName}</span>}
    </div>
  </section>
);
