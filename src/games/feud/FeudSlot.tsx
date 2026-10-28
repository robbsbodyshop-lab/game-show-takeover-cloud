import { cx } from '@/design/cx';
import type { AudienceSlot } from '@/engines/feud/selectors';
import styles from './FeudSlot.module.css';

export interface FeudSlotProps {
  /** Zero-based; the number plate shows index + 1. */
  index: number;
  /** Null for a position beyond the survey's answer count. */
  slot: AudienceSlot | null;
}

/**
 * One row of the board. A hidden row renders the number plate and a blank bar and nothing else:
 * the answer text is not in the DOM until the engine reveals it (P-002, FR-014).
 */
export const FeudSlot = ({ index, slot }: FeudSlotProps) => {
  if (slot === null) {
    return <li className={cx(styles.slot, styles.empty)} data-state="empty" aria-hidden="true" />;
  }
  if (!slot.revealed) {
    return (
      <li
        className={cx(styles.slot, styles.hidden)}
        data-state="hidden"
        aria-label={`Answer ${(index + 1).toString()} hidden`}
      >
        <span className={styles.plate}>{index + 1}</span>
        <span className={styles.bar} />
      </li>
    );
  }
  return (
    <li
      className={cx(styles.slot, styles.revealed, slot.via === 'leftover' && styles.leftover)}
      data-state="revealed"
      data-via={slot.via ?? ''}
    >
      <span className={styles.plate}>{index + 1}</span>
      <span className={styles.bar}>
        <span className={styles.answer}>{slot.answer}</span>
        <span className={styles.points}>{slot.points}</span>
      </span>
    </li>
  );
};
