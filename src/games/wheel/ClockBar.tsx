import { cx } from '@/design/cx';
import type { ClockSnapshot } from './hostData';
import { useClockRemaining } from './useWheelController';
import styles from './ClockBar.module.css';

export interface ClockBarProps {
  clock: ClockSnapshot | null;
  className?: string;
}

/** A decision or game clock as a bar of ten blocks plus the seconds left; hidden with no clock. */
export const ClockBar = ({ clock, className }: ClockBarProps) => {
  const remaining = useClockRemaining(clock);
  if (!clock || remaining === null) return null;
  const blocks = 10;
  const lit = Math.ceil((remaining / Math.max(1, clock.totalMs)) * blocks);
  const seconds = Math.ceil(remaining / 1000);
  return (
    <div
      className={cx(styles.bar, className)}
      data-testid="clock-bar"
      data-kind={clock.kind}
      data-low={remaining <= 3000}
      data-running={clock.running}
    >
      <span className={styles.label}>{clock.label}</span>
      <span className={styles.blocks} aria-hidden="true">
        {Array.from({ length: blocks }, (_, i) => (
          <span key={i} className={styles.block} data-lit={i < lit} />
        ))}
      </span>
      <span className={styles.seconds} role="timer" aria-label={`${String(seconds)} seconds left`}>
        {seconds}
      </span>
    </div>
  );
};
