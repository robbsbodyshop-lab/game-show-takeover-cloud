import type { CSSProperties } from 'react';
import { Badge } from '@/design';
import type { Team } from '@/engines/event';
import styles from './Door.module.css';

export interface DoorProps {
  number: number;
  /** Team holding this door, if any. */
  holder: Team | undefined;
  /** Play position behind the door once revealed (1 = first). */
  position: number | null;
  /** Position in the reveal sequence, for the stagger. */
  order: number;
  disabled: boolean;
  onPick: () => void;
}

const ordinal = (n: number): string => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${String(n)}th`;
  switch (n % 10) {
    case 1:
      return `${String(n)}st`;
    case 2:
      return `${String(n)}nd`;
    case 3:
      return `${String(n)}rd`;
    default:
      return `${String(n)}th`;
  }
};

export const Door = ({ number, holder, position, order, disabled, onPick }: DoorProps) => {
  const open = position !== null;
  const label = open
    ? `Door ${String(number)}: ${holder?.name ?? 'nobody'} plays ${ordinal(position)}`
    : holder
      ? `Door ${String(number)}, picked by ${holder.name}`
      : `Door ${String(number)}`;
  return (
    <button
      type="button"
      className={styles.door}
      data-open={open}
      data-taken={holder !== undefined}
      disabled={disabled}
      aria-label={label}
      style={
        {
          '--team-color': holder?.color ?? 'transparent',
          '--reveal-delay': `${String(order * 500)}ms`,
        } as CSSProperties
      }
      onClick={onPick}
    >
      <Badge tone="gold" className={styles.plate}>
        {number}
      </Badge>
      <span className={styles.knob} aria-hidden="true" />
      <span className={styles.holder}>{holder?.name ?? ''}</span>
      {open ? (
        <span className={styles.behind} aria-hidden="true">
          <span className={styles.position}>{ordinal(position)}</span>
          <span className={styles.who}>{holder?.name}</span>
        </span>
      ) : null}
    </button>
  );
};
