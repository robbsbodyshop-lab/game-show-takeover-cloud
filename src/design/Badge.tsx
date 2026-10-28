import type { HTMLAttributes } from 'react';
import { cx } from './cx';
import styles from './Badge.module.css';

export type BadgeTone = 'cream' | 'gold' | 'orange' | 'confirm' | 'info' | 'host';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

/** Small tag with an ink outline: buzzer numbers, team slots, door plates. */
export const Badge = ({ tone = 'cream', className, ...rest }: BadgeProps) => (
  <span data-tone={tone} className={cx(styles.badge, styles[tone], className)} {...rest} />
);
