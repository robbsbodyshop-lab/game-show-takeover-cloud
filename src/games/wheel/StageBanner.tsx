import { cx } from '@/design/cx';
import { NumberDisplay } from '@/design';
import styles from './StageBanner.module.css';

export type StageBannerKind = 'triple' | 'speedup';

export interface StageBannerProps {
  kind: StageBannerKind;
  /** Triple Toss-Up: "PUZZLE 2 OF 3" and its theme. */
  detail?: string | null;
  /** Speed-Up: what each consonant pays once the spin is made. */
  value?: number | null;
  className?: string;
}

/** The Triple Toss-Up and Speed-Up banners (rules "Episode structure", "The Speed-Up"). */
export const StageBanner = ({ kind, detail = null, value = null, className }: StageBannerProps) => (
  <div className={cx(styles.banner, className)} data-kind={kind} data-testid="stage-banner" role="status">
    <span className={styles.title}>{kind === 'triple' ? 'TRIPLE TOSS-UP' : 'SPEED-UP'}</span>
    {kind === 'speedup' ? (
      value === null ? (
        <span className={styles.detail}>SPIN ONCE: EVERY CONSONANT PAYS THAT PLUS $1,000</span>
      ) : (
        <span className={styles.detail}>
          CONSONANTS PAY <NumberDisplay value={value} prefix="$" size="md" className={styles.value} />, VOWELS
          ARE FREE
        </span>
      )
    ) : detail ? (
      <span className={styles.detail}>{detail}</span>
    ) : null}
  </div>
);
