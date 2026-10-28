import type { ReactNode } from 'react';
import { cx } from '@/design/cx';
import styles from './PuzzleTile.module.css';
import { SpriteIcon } from './SpriteIcon';
import type { SpriteId } from './sprites';

export interface PuzzleTileProps {
  title: ReactNode;
  subtitle?: string;
  icon?: SpriteId;
  /** The committed value (drawn with the selected state). */
  selected?: boolean;
  /** Which players' cursors are on this tile. */
  cursors?: readonly (0 | 1)[];
  compact?: boolean;
  /** Draw the player marker sprites on the tile (default true). */
  markers?: boolean;
  onClick: () => void;
  className?: string;
  testId?: string;
}

/** Memory-card tile for the puzzle menus: the cursor of each player is shown by their marker sprite. */
export const PuzzleTile = ({
  title,
  subtitle,
  icon,
  selected = false,
  cursors = [],
  compact = false,
  markers = true,
  onClick,
  className,
  testId,
}: PuzzleTileProps) => (
  <button
    type="button"
    role="option"
    aria-selected={selected}
    tabIndex={-1}
    data-testid={testId}
    data-p1={cursors.includes(0)}
    data-p2={cursors.includes(1)}
    data-compact={compact}
    className={cx(styles.tile, className)}
    onClick={onClick}
  >
    {markers && cursors.includes(0) ? (
      <SpriteIcon id="marker-level-p1" scale={2} className={styles.markerTop} />
    ) : null}
    {icon ? <SpriteIcon id={icon} scale={compact ? 2 : 3} className={styles.icon} /> : null}
    <span className={styles.title}>{title}</span>
    {subtitle ? <span className={styles.subtitle}>{subtitle}</span> : null}
    {markers && cursors.includes(1) ? (
      <SpriteIcon id="marker-level-p2" scale={2} className={styles.markerBottom} />
    ) : null}
  </button>
);
