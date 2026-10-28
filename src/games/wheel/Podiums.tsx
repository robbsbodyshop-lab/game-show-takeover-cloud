import type { CSSProperties } from 'react';
import type { AudienceTeam } from '@/engines/wheel/selectors';
import type { TeamId } from '@/engines/wheel/types';
import { cx } from '@/design/cx';
import { Badge, NumberDisplay } from '@/design';
import { ClockBar } from './ClockBar';
import type { ClockSnapshot } from './hostData';
import { money } from './format';
import styles from './Podiums.module.css';

export interface PodiumsProps {
  /** Teams in play order. */
  teams: readonly AudienceTeam[];
  colors: Readonly<Record<number, string>>;
  /** The team whose turn it is (or who is answering): its podium glows. */
  active: TeamId | null;
  /** The team whose Wild Card call is in play. */
  wildCardPlaying?: TeamId | null;
  /** The decision clock, shown on the active podium. */
  clock?: ClockSnapshot | null;
  className?: string;
}

/**
 * One podium per team in play order (FR-040): round cash, bank, and badges for the Wild Card, the
 * Million Dollar Wedge, round prizes and banked prizes. The active podium glows with stepped motion.
 */
export const Podiums = ({
  teams,
  colors,
  active,
  wildCardPlaying = null,
  clock = null,
  className,
}: PodiumsProps) => (
  <div className={cx(styles.row, className)} data-testid="podiums">
    {teams.map((t) => {
      const isActive = t.id === active;
      const prizeCount = t.prizes.length + t.roundPrizes.length;
      return (
        <section
          key={t.id}
          className={styles.podium}
          data-testid={`podium-${String(t.id)}`}
          data-active={isActive}
          data-locked={t.lockedOut}
          aria-label={`${t.name} podium`}
          style={{ '--team': colors[t.id] ?? 'var(--c-gold)' } as CSSProperties}
        >
          <h3 className={styles.name}>{t.name}</h3>
          <NumberDisplay
            value={t.roundCash}
            prefix="$"
            size="lg"
            className={styles.cash}
            aria-label="Round cash"
          />
          <div className={styles.bank}>
            <span>BANK</span>
            <span className={styles.bankValue}>{money(t.bank)}</span>
          </div>
          <div className={styles.badges}>
            {t.wildCard ? <Badge tone="orange">WILD CARD</Badge> : null}
            {wildCardPlaying === t.id ? <Badge tone="gold">WILD CARD PLAYED</Badge> : null}
            {t.millionWedge ? <Badge tone="gold">MILLION $</Badge> : null}
            {prizeCount > 0 ? (
              <Badge tone="info">
                {prizeCount} {prizeCount === 1 ? 'PRIZE' : 'PRIZES'}
              </Badge>
            ) : null}
            {t.lockedOut ? <Badge tone="orange">LOCKED OUT</Badge> : null}
          </div>
          {isActive ? <ClockBar clock={clock} className={styles.clock} /> : null}
        </section>
      );
    })}
  </div>
);
