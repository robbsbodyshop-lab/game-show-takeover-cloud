import type { AudienceCell } from '@/engines/wheel/selectors';
import { BOARD_ROWS } from '@/engines/wheel/boardLayout';
import { cx } from '@/design/cx';
import styles from './PuzzleBoard.module.css';

export interface PuzzleBoardProps {
  /** The audience board: a lit tile carries its letter, an unlit one carries nothing at all (P-002). */
  board: readonly (readonly AudienceCell[])[] | null;
  /** Bulbs chase round the frame once the puzzle is solved. */
  solved?: boolean;
  flash?: 'good' | 'bad' | null;
  className?: string;
}

const blankRows = (): AudienceCell[][] =>
  BOARD_ROWS.map((width) => Array.from({ length: width }, (): AudienceCell => ({ kind: 'blank' })));

/**
 * The puzzle board on the 12/14/14/12 layout (FR-042). Hidden letters stay teal blanks, lit tiles
 * pop in with stepped motion, blank squares are dark voids, and the frame flashes good or bad.
 */
export const PuzzleBoard = ({ board, solved = false, flash = null, className }: PuzzleBoardProps) => {
  const rows = board ?? blankRows();
  return (
    <div
      className={cx(styles.frame, className)}
      data-testid="puzzle-board"
      data-solved={solved}
      data-flash={flash ?? undefined}
    >
      <div className={styles.bulbs} aria-hidden="true" />
      <div className={styles.grid} role="img" aria-label="The puzzle board">
        {rows.map((row, r) => (
          <div key={r} className={styles.row} data-testid="board-row" data-width={row.length}>
            {row.map((cell, c) => {
              if (cell.kind === 'blank') return <span key={c} className={styles.void} data-testid="void" />;
              if (cell.kind === 'punct')
                return (
                  <span key={c} className={styles.tile} data-lit="true" data-punct="true" data-testid="tile">
                    {cell.char}
                  </span>
                );
              return (
                <span key={c} className={styles.tile} data-lit={cell.lit} data-testid="tile">
                  {cell.lit ? cell.char : null}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
