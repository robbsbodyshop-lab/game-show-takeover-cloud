import { cx } from '@/design/cx';
import styles from './CategoryStrip.module.css';

export interface CategoryStripProps {
  category: string | null;
  /** Round name above the category, such as "ROUND 2" or "SPEED-UP". */
  heading: string;
  /** Triple Toss-Up theme. */
  theme?: string | null;
  prizePuzzle?: boolean;
  /** "NO MORE VOWELS" or "ONLY VOWELS REMAIN". */
  notice?: string | null;
  className?: string;
}

/** The category banner above the board, with the round heading and the vowel notices. */
export const CategoryStrip = ({
  category,
  heading,
  theme = null,
  prizePuzzle = false,
  notice = null,
  className,
}: CategoryStripProps) => (
  <div className={cx(styles.strip, className)} data-testid="category-strip">
    <span className={styles.heading}>{heading}</span>
    <span className={styles.category} data-testid="category">
      {prizePuzzle ? 'PRIZE PUZZLE: ' : null}
      {category ?? ''}
      {theme ? <span className={styles.theme}> | {theme}</span> : null}
    </span>
    {notice ? (
      <span className={styles.notice} role="status">
        {notice}
      </span>
    ) : null}
  </div>
);
