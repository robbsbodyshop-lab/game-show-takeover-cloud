import type { AudienceSlot } from '@/engines/feud/selectors';
import { FeudSlot } from './FeudSlot';
import styles from './FeudBoard.module.css';

export const BOARD_POSITIONS = 8;

export interface FeudBoardProps {
  slots: readonly AudienceSlot[];
}

/** The survey board: eight positions in two columns, chasing square bulbs round the frame. */
export const FeudBoard = ({ slots }: FeudBoardProps) => (
  <div className={styles.frame}>
    <ol className={styles.board} aria-label="Survey board" data-count={slots.length}>
      {Array.from({ length: BOARD_POSITIONS }, (_, index) => (
        <FeudSlot key={index} index={index} slot={slots[index] ?? null} />
      ))}
    </ol>
  </div>
);
