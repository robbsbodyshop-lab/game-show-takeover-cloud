import type { HTMLAttributes } from 'react';
import { cx } from './cx';
import styles from './NumberDisplay.module.css';

export type NumberSize = 'md' | 'lg' | 'xl';

export interface NumberDisplayProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  value: number | string;
  size?: NumberSize;
  /** Left-pad numeric values with zeros to this many digits (scores, clocks). */
  padTo?: number;
  /** Text before the number, such as "$". */
  prefix?: string;
}

/** Whole-element numbers (scores, timers, cash) in Silkscreen with tabular digits so they never jitter. */
export const NumberDisplay = ({
  value,
  size = 'md',
  padTo,
  prefix,
  className,
  ...rest
}: NumberDisplayProps) => {
  const text =
    typeof value === 'number' && padTo !== undefined ? String(value).padStart(padTo, '0') : String(value);
  return (
    <span data-size={size} className={cx(styles.number, styles[size], className)} {...rest}>
      {prefix}
      {text}
    </span>
  );
};
