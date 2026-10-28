import { Button, NumberDisplay } from '@/design';
import type { Team } from '@/engines/event';
import styles from './ScoreRow.module.css';

export const SCORE_STEP = 10;
export const CHIP_STEP = 1;

export interface ScoreRowProps {
  team: Team;
  leader: boolean;
  onScore: (team: number, delta: number) => void;
  onChips: (team: number, delta: number) => void;
}

export const ScoreRow = ({ team, leader, onScore, onChips }: ScoreRowProps) => (
  <li className={styles.row} style={{ borderLeftColor: team.color }} aria-label={team.name}>
    <div className={styles.head}>
      <span className={styles.swatch} style={{ backgroundColor: team.color }} aria-hidden="true" />
      <span className={styles.name}>{team.name}</span>
      {leader ? <span className={styles.lead}>LEAD</span> : null}
    </div>
    <div className={styles.controls}>
      <Button
        size="sm"
        variant="quiet"
        className={styles.step}
        aria-label={`${team.name} score minus ${String(SCORE_STEP)}`}
        onClick={() => {
          onScore(team.id, -SCORE_STEP);
        }}
      >
        -{SCORE_STEP}
      </Button>
      <NumberDisplay value={team.score} size="md" className={styles.score} />
      <Button
        size="sm"
        variant="secondary"
        className={styles.step}
        aria-label={`${team.name} score plus ${String(SCORE_STEP)}`}
        onClick={() => {
          onScore(team.id, SCORE_STEP);
        }}
      >
        +{SCORE_STEP}
      </Button>
      <Button
        size="sm"
        variant="quiet"
        className={styles.step}
        aria-label={`${team.name} chips minus ${String(CHIP_STEP)}`}
        onClick={() => {
          onChips(team.id, -CHIP_STEP);
        }}
      >
        -{CHIP_STEP}
      </Button>
      <NumberDisplay value={team.chips} prefix="Chips " size="md" className={styles.chips} />
      <Button
        size="sm"
        variant="secondary"
        className={styles.step}
        aria-label={`${team.name} chips plus ${String(CHIP_STEP)}`}
        onClick={() => {
          onChips(team.id, CHIP_STEP);
        }}
      >
        +{CHIP_STEP}
      </Button>
    </div>
  </li>
);
