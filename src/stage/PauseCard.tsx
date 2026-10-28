import { Button, Marquee } from '@/design';
import styles from './PauseCard.module.css';

export interface PauseCardProps {
  /** Show mode hides every host button; the keys still resume. */
  showMode: boolean;
  onResume: () => void;
}

/**
 * Stand By card (F8). Covers the stage; Enter and Space are swallowed by the hotkey layer, so only
 * F8, Escape or the Resume button resume play (HOST_FEATURE_INVENTORY.md 2.2).
 */
export const PauseCard = ({ showMode, onResume }: PauseCardProps) => (
  <div className={styles.cover} role="dialog" aria-label="Paused" data-testid="pause-card">
    <div className={styles.card}>
      <Marquee as="h2">Stand by</Marquee>
      {showMode ? null : (
        <>
          <Button variant="confirm" size="lg" onClick={onResume}>
            Resume
          </Button>
          <p className={styles.hint}>F8 or Escape also resumes. Enter and Space do nothing while paused.</p>
        </>
      )}
    </div>
  </div>
);
