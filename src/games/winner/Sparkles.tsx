import type { CSSProperties } from 'react';
import styles from './Sparkles.module.css';

const COUNT = 48;
const TONES = ['gold', 'bulb', 'aqua', 'orange'] as const;

/** Fixed, repeatable scatter (no randomness): index maths spreads the pixels over the frame. */
const sparkles = Array.from({ length: COUNT }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  top: (i * 53 + 7) % 100,
  tone: TONES[i % TONES.length] ?? 'gold',
  big: i % 5 === 0,
  delay: (i % 8) * 125,
}));

/** Confetti-free celebration: square pixels that blink in hard steps. Decorative only. */
export const Sparkles = () => (
  <div className={styles.sparkles} aria-hidden="true" data-testid="sparkles">
    {sparkles.map((s, i) => (
      <span
        key={i}
        className={`${styles.pixel} ${styles[s.tone]} ${s.big ? styles.big : ''}`}
        style={
          {
            left: `${s.left.toString()}%`,
            top: `${s.top.toString()}%`,
            '--delay': `${s.delay.toString()}ms`,
          } as CSSProperties
        }
      />
    ))}
  </div>
);
