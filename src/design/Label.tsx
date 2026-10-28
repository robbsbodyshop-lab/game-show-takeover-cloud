import type { HTMLAttributes } from 'react';
import { cx } from './cx';
import styles from './Label.module.css';

export interface LabelProps extends HTMLAttributes<HTMLElement> {
  /** Renders a real <label> bound to this control id; otherwise a <span>. */
  htmlFor?: string;
}

/** Small uppercase pixel label in mist. */
export const Label = ({ htmlFor, className, ...rest }: LabelProps) =>
  htmlFor ? (
    <label htmlFor={htmlFor} className={cx(styles.label, className)} {...rest} />
  ) : (
    <span className={cx(styles.label, className)} {...rest} />
  );
