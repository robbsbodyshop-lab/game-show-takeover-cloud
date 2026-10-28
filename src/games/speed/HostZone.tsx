import { useState, type FocusEvent, type ReactNode } from 'react';
import { cx } from '@/design/cx';
import styles from './HostZone.module.css';

export interface HostZoneProps {
  /** Show mode hides the controls until the pointer or keyboard focus is inside the zone. */
  showMode: boolean;
  children: ReactNode;
  className?: string;
  label?: string;
}

/**
 * The strip of host-only controls on a stage screen (HOST_FEATURE_INVENTORY.md 2.3). Outside show mode
 * it is a plain region. In show mode the zone stays as an invisible hover target and its controls are
 * not rendered until the pointer enters it or focus lands inside; keys keep working either way.
 */
export const HostZone = ({ showMode, children, className, label = 'Host controls' }: HostZoneProps) => {
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const revealed = !showMode || hover || focused;

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
  };

  return (
    <div
      role="region"
      aria-label={label}
      data-testid="host-zone"
      data-show-mode={showMode}
      data-revealed={revealed}
      className={cx(styles.zone, className)}
      onMouseEnter={() => {
        setHover(true);
      }}
      onMouseLeave={() => {
        setHover(false);
      }}
      onFocus={() => {
        setFocused(true);
      }}
      onBlur={onBlur}
    >
      {revealed ? children : null}
    </div>
  );
};
