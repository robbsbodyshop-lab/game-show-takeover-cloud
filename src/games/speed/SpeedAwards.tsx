import { useState } from 'react';
import { Button, Inset, Label, NumberDisplay } from '@/design';
import type { Team } from '@/engines/event';
import styles from './SpeedAwards.module.css';

export const POINT_STEP = 10;

export interface TeamAward {
  team: number;
  points: number;
  chips: number;
}

export interface SpeedAwardsProps {
  teams: Team[];
  disabled: boolean;
  /** Called once with one entry per team (zeroes included). */
  onAward: (awards: TeamAward[]) => void;
}

/** Host-only award sheet: per team +/- 10 points and +/- chips, then one button to bank them. */
export const SpeedAwards = ({ teams, disabled, onAward }: SpeedAwardsProps) => {
  const [draft, setDraft] = useState<Record<number, { points: number; chips: number }>>({});

  const read = (id: number) => draft[id] ?? { points: 0, chips: 0 };

  const adjust = (team: Team, field: 'points' | 'chips', delta: number) => {
    setDraft((prev) => {
      const cur = prev[team.id] ?? { points: 0, chips: 0 };
      // Never award a net loss that would push a score below zero, or a negative chip award.
      const next =
        field === 'points' ? Math.max(-team.score, cur.points + delta) : Math.max(0, cur.chips + delta);
      return { ...prev, [team.id]: { ...cur, [field]: next } };
    });
  };

  return (
    <Inset className={styles.awards} aria-label="Speed Round awards">
      <Label>Awards</Label>
      <ul className={styles.list}>
        {teams.map((team) => {
          const a = read(team.id);
          return (
            <li key={team.id} className={styles.card} style={{ borderColor: team.color }}>
              <span className={styles.name}>{team.name}</span>
              <div className={styles.row}>
                <Button
                  size="sm"
                  variant="quiet"
                  disabled={disabled}
                  aria-label={`${team.name} minus ${POINT_STEP.toString()} points`}
                  onClick={() => {
                    adjust(team, 'points', -POINT_STEP);
                  }}
                >
                  -{POINT_STEP}
                </Button>
                <NumberDisplay
                  size="md"
                  value={`${a.points > 0 ? '+' : ''}${a.points.toString()}`}
                  data-testid={`award-points-${team.id.toString()}`}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={disabled}
                  aria-label={`${team.name} plus ${POINT_STEP.toString()} points`}
                  onClick={() => {
                    adjust(team, 'points', POINT_STEP);
                  }}
                >
                  +{POINT_STEP}
                </Button>
              </div>
              <div className={styles.row}>
                <Button
                  size="sm"
                  variant="quiet"
                  disabled={disabled || a.chips === 0}
                  aria-label={`${team.name} minus 1 chip`}
                  onClick={() => {
                    adjust(team, 'chips', -1);
                  }}
                >
                  -1
                </Button>
                <span className={styles.chips} data-testid={`award-chips-${team.id.toString()}`}>
                  +{a.chips} chip{a.chips === 1 ? '' : 's'}
                </span>
                <Button
                  size="sm"
                  variant="confirm"
                  disabled={disabled}
                  aria-label={`${team.name} plus 1 chip`}
                  onClick={() => {
                    adjust(team, 'chips', 1);
                  }}
                >
                  +1
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <Button
        variant="primary"
        disabled={disabled}
        onClick={() => {
          onAward(teams.map((t) => ({ team: t.id, ...read(t.id) })));
        }}
      >
        Award and return to hub
      </Button>
    </Inset>
  );
};
