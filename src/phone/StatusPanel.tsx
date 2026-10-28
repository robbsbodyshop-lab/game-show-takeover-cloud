import type { ReactNode } from 'react';
import { Panel } from '@/design';
import styles from './phone.module.css';

export interface StatusPanelProps {
  title: string;
  detail?: string;
  /** Pixel spinner; stepped, and still under reduced motion (the text carries the meaning). */
  spinner?: boolean;
  children?: ReactNode;
}

/** A centred message for transient states: connecting, waiting for the game screen, errors. */
export const StatusPanel = ({ title, detail, spinner = false, children }: StatusPanelProps) => (
  <Panel role="status" aria-live="polite" className={`${styles.panel} ${styles.status}`}>
    {spinner ? <span aria-hidden="true" className={styles.spinner} /> : null}
    <p className={styles.statusTitle}>{title}</p>
    {detail ? <p className={styles.statusDetail}>{detail}</p> : null}
    {children}
  </Panel>
);
