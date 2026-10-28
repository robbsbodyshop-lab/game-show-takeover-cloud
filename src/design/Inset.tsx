import type { HTMLAttributes } from 'react';
import { cx } from './cx';
import styles from './Inset.module.css';

export type InsetProps = HTMLAttributes<HTMLDivElement>;

/** Darker well inside a panel: settings groups, lists, read-outs. */
export const Inset = ({ className, ...rest }: InsetProps) => (
  <div className={cx(styles.inset, className)} {...rest} />
);
