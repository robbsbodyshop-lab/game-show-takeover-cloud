import { Button } from '@/design/Button';
import type { BoardSlot } from '@/engines/feud/types';
import styles from './ConsoleBoard.module.css';

export interface ConsoleBoardProps {
  board: readonly BoardSlot[];
  /** Rulings can be given right now (someone is answering and nothing is waiting). */
  canJudge: boolean;
  onJudge: (slot: number) => void;
}

const VIA: Record<string, string> = {
  faceoff: 'face-off',
  control: 'control',
  steal: 'steal',
  leftover: 'revealed by host',
};

/** The full board with answers, points and aliases; each row can be ruled in with Accept. */
export const ConsoleBoard = ({ board, canJudge, onJudge }: ConsoleBoardProps) => (
  <ol className={styles.board} aria-label="Full board">
    {board.map((slot, index) => (
      <li key={index} className={styles.row} data-revealed={slot.revealed ? 'true' : 'false'}>
        <span className={styles.rank}>#{index + 1}</span>
        <span className={styles.answer}>
          {slot.answer}
          {slot.aliases.length > 0 && <span className={styles.aliases}>{slot.aliases.join(', ')}</span>}
        </span>
        <span className={styles.points}>{slot.points}</span>
        <span className={styles.status}>
          {slot.revealed ? `up (${VIA[slot.via ?? ''] ?? 'revealed'})` : 'hidden'}
        </span>
        <Button
          variant={slot.revealed ? 'quiet' : 'confirm'}
          size="sm"
          disabled={!canJudge}
          aria-label={`Accept #${(index + 1).toString()} ${slot.answer}`}
          onClick={() => {
            onJudge(index);
          }}
        >
          Accept
        </Button>
      </li>
    ))}
  </ol>
);
