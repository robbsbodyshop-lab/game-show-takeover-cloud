import type { ReactNode } from 'react';
import { cx } from '@/design/cx';
import styles from './HostOnly.module.css';

export interface HostOnlyProps {
  showMode: boolean;
  className?: string;
  children?: ReactNode;
}

/** Host-only controls: hidden in show mode and back on hover or focus (HOST_FEATURE_INVENTORY.md 2.3). */
export const HostOnly = ({ showMode, className, children }: HostOnlyProps) => (
  <div
    className={cx(styles.hostOnly, className)}
    data-host-only=""
    data-show-mode={showMode ? 'true' : 'false'}
  >
    {children}
  </div>
);
