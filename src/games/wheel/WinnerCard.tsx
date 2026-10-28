import type { GameResult } from '@/engines/wheel/selectors';
import { Button, Marquee, Panel } from '@/design';
import { money, points } from './format';
import styles from './WinnerCard.module.css';

export interface WinnerCardProps {
  result: GameResult;
  teams: readonly { id: number; name: string; bank: number }[];
  showButtons: boolean;
  onContinue: () => void;
}

/** The game winner card (inventory 1.5 step 7): total, points, the Plinko chips, the others' points. */
export const WinnerCard = ({ result, teams, showButtons, onContinue }: WinnerCardProps) => {
  const winner = teams.find((t) => t.id === result.winnerId);
  const others = teams.filter((t) => t.id !== result.winnerId);
  return (
    <Panel className={styles.card} role="status" data-testid="winner-card">
      <Marquee as="h2">{winner?.name ?? 'WINNER'} WINS!</Marquee>
      <p className={styles.total}>{money(winner?.bank ?? 0)}</p>
      <p className={styles.line}>
        +{points(result.score)} and a Plinko chip
        {result.bonusChips > 0 ? ' + a BONUS chip for the Bonus Round win' : ''}
      </p>
      <ul className={styles.others}>
        {others.map((t) => (
          <li key={t.id}>
            {t.name} keeps {points(result.extraScores[t.id] ?? 0)}
          </li>
        ))}
      </ul>
      {showButtons ? (
        <Button variant="primary" size="lg" onClick={onContinue}>
          Continue to the hub (Enter)
        </Button>
      ) : null}
    </Panel>
  );
};
