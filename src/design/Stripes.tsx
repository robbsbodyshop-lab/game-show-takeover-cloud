import type { HTMLAttributes } from 'react';
import { cx } from './cx';
import styles from './Stripes.module.css';

export type StripesProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'>;

/** Four-colour bar: orange, gold, green, blue. Sits under titles and at the top of menus. */
export const Stripes = ({ className, ...rest }: StripesProps) => (
  <div aria-hidden="true" className={cx(styles.stripes, className)} {...rest}>
    <span className={styles.orange} />
    <span className={styles.gold} />
    <span className={styles.green} />
    <span className={styles.blue} />
  </div>
);
