import { Button, Inset, Label } from '@/design';
import type { ConsoleSectionProps } from './consoleTypes';
import { money } from './format';
import styles from './WheelConsole.module.css';

const STEPS = [-1000, -500, -100, 100, 500, 1000] as const;

const stepLabel = (n: number): string => `${n < 0 ? '-' : '+'}${money(Math.abs(n))}`;

/** Round money, bank and the Adjust bank tools per team (inventory 2.9 "Scores"). */
export const ConsoleScores = ({ data, send }: ConsoleSectionProps) => (
  <div className={styles.group}>
    <Label>Scores and bank fixes</Label>
    <Inset className={styles.scores} data-testid="console-scores">
      {data.teams.map((t) => (
        <div key={t.id} className={styles.team} data-turn={t.id === data.turn}>
          <div className={styles.teamLine}>
            <strong>{t.name}</strong>
            <span>round {money(t.roundCash)}</span>
            <span>bank {money(t.bank)}</span>
            {t.wildCard ? <span className={styles.tag}>WILD</span> : null}
            {t.millionWedge !== 'none' ? (
              <span className={styles.tag}>1M{t.millionWedge === 'kept' ? ' (kept)' : ''}</span>
            ) : null}
            {t.prizes.length + t.roundPrizes.length > 0 ? (
              <span className={styles.tag}>
                {[...t.prizes, ...t.roundPrizes.map((p) => p.name)].join(', ')}
              </span>
            ) : null}
          </div>
          <div className={styles.row} role="group" aria-label={`Adjust ${t.name} bank`}>
            {STEPS.map((delta) => (
              <Button
                key={delta}
                size="sm"
                variant="quiet"
                aria-label={`${stepLabel(delta)} to ${t.name} bank`}
                onClick={() => {
                  send('adjust-bank', { team: t.id, delta });
                }}
              >
                {stepLabel(delta)}
              </Button>
            ))}
          </div>
        </div>
      ))}
    </Inset>
  </div>
);
