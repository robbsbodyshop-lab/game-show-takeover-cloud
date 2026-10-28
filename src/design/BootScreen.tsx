import { useEffect, useRef, type CSSProperties } from 'react';
import { Dither } from './Dither';
import { useReducedMotion } from './useReducedMotion';
import styles from './BootScreen.module.css';

export interface BootScreenProps {
  /** Called exactly once: when the boot finishes, is skipped by click/key, or immediately under reduced motion. */
  onDone: () => void;
  durationMs?: number;
  wordmark?: string;
}

const SPECTRUM = ['rust', 'orange', 'gold', 'olive', 'aqua', 'teal', 'plum'] as const;

/** 2-second PS1-style boot: ink, ordered-dither spectrum sweep, wordmark. Skips instantly under reduced motion. */
export const BootScreen = ({
  onDone,
  durationMs = 2000,
  wordmark = 'Game Show Takeover',
}: BootScreenProps) => {
  const reduced = useReducedMotion();
  const doneRef = useRef(onDone);
  const firedRef = useRef(false);

  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    const finish = () => {
      if (firedRef.current) return;
      firedRef.current = true;
      doneRef.current();
    };
    if (reduced) {
      finish();
      return;
    }
    const timer = window.setTimeout(finish, durationMs);
    const skip = () => {
      window.clearTimeout(timer);
      finish();
    };
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, [reduced, durationMs]);

  if (reduced) return null;

  return (
    <div
      className={styles.boot}
      role="status"
      aria-label="Starting"
      style={{ '--boot-ms': `${durationMs.toString()}ms` } as CSSProperties}
    >
      <div className={styles.sweep} aria-hidden="true">
        {SPECTRUM.map((tone) => (
          <span key={tone} className={styles[tone]} />
        ))}
        <Dither variant="checker" className={styles.mask} />
      </div>
      <p className={styles.wordmark}>{wordmark}</p>
    </div>
  );
};
