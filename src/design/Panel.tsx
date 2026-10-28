import type { ComponentPropsWithRef } from 'react';
import { cx } from './cx';
import styles from './Panel.module.css';

export type PanelProps = ComponentPropsWithRef<'div'>;

/** Main surface: dithered night blue, 4px ink outline, two-tone bevel, 6px hard shadow. */
export const Panel = ({ className, ...rest }: PanelProps) => (
  <div className={cx(styles.panel, className)} {...rest} />
);
