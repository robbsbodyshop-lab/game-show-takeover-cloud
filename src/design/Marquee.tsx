import type { HTMLAttributes } from 'react';
import { cx } from './cx';
import styles from './Marquee.module.css';

export interface MarqueeProps extends HTMLAttributes<HTMLElement> {
  /** Element to render; default `div`. Use `h1`/`h2` when the band is the screen title. */
  as?: 'div' | 'h1' | 'h2' | 'h3';
}

/** Title band: ink fill, gold frame, two interleaved rings of bulbs that chase in steps. */
export const Marquee = ({ as: Tag = 'div', className, children, ...rest }: MarqueeProps) => (
  <Tag className={cx(styles.marquee, className)} {...rest}>
    <span className={styles.text}>{children}</span>
  </Tag>
);
