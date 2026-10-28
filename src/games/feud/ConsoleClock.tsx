import { Label } from '@/design/Label';
import { NumberDisplay } from '@/design/NumberDisplay';
import { useNow } from './useNow';
import type { ClockView } from './types';
import styles from './ConsoleClock.module.css';

export interface ConsoleClockProps {
  label: string;
  clock: ClockView | null;
  /** The moment this device received `clock`. */
  receivedAt: number;
  /** Shown when there is no clock at all (for example an untimed steal huddle). */
  emptyText?: string;
}

/** A host-only countdown that extrapolates from the last snapshot while it runs. */
export const ConsoleClock = ({ label, clock, receivedAt, emptyText = 'off' }: ConsoleClockProps) => {
  const now = useNow(clock?.running === true);
  if (clock === null) {
    return (
      <div className={styles.clock} data-state="off">
        <Label>{label}</Label>
        <span className={styles.empty}>{emptyText}</span>
      </div>
    );
  }
  const elapsed = clock.running ? Math.max(0, now - receivedAt) : 0;
  const lead = Math.max(0, clock.leadMs - elapsed);
  const left = Math.max(0, clock.remainingMs - Math.max(0, elapsed - clock.leadMs));
  const held = lead > 0 || !clock.running;
  return (
    <div className={styles.clock} data-state={clock.running ? (held ? 'held' : 'running') : 'paused'}>
      <Label>{label}</Label>
      <NumberDisplay value={(left / 1000).toFixed(1)} size="md" />
      <span className={styles.note}>
        {!clock.running ? 'held' : lead > 0 ? `starts in ${(lead / 1000).toFixed(1)}s` : 'running'}
      </span>
    </div>
  );
};
