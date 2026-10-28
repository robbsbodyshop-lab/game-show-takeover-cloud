import { Marquee } from '@/design/Marquee';
import { NumberDisplay } from '@/design/NumberDisplay';
import { FastMoneyBoard } from './FastMoneyBoard';
import type { FeudViewModel } from './types';
import styles from './FastMoney.module.css';

export interface FastMoneyProps {
  view: FeudViewModel;
}

const TITLES: Record<string, string> = {
  setup: 'Getting ready',
  'p1-ready': 'Player 1 is up',
  'p2-ready': 'Player 2 is up',
  'p1-reveal': 'Player 1 answers',
  'p2-reveal': 'Player 2 answers',
  done: 'Fast Money is done',
};

/**
 * Fast Money for the audience: a question only while a player answers (rules, Fast Money 2), the clock,
 * then "You said / Survey said" rows and the total.
 */
export const FastMoney = ({ view }: FastMoneyProps) => {
  const fm = view.audience.fastMoney;
  if (fm === null) return null;
  const player = fm.answering;
  const playing = player !== null;
  const seconds = view.fmClockMs === null ? null : Math.ceil(view.fmClockMs / 1000);
  const family = view.teams[fm.family].name;
  const showBoard = fm.revealing !== null || fm.phase === 'done';
  return (
    <div className={styles.screen}>
      <Marquee as="h1">{`Fast Money: ${family}`}</Marquee>
      <p className={styles.status}>
        {playing
          ? `Player ${player.toString()}`
          : fm.phase === 'done'
            ? fm.outcome === 'jackpot'
              ? 'JACKPOT!'
              : 'Fast Money is done'
            : (TITLES[fm.phase] ?? '')}
      </p>
      {playing && (
        <div className={styles.play}>
          <p className={styles.question} aria-live="polite">
            {fm.question ?? ''}
          </p>
          <div className={styles.clock} aria-label="Clock">
            <NumberDisplay value={seconds ?? 0} size="xl" padTo={2} />
          </div>
        </div>
      )}
      {showBoard && <FastMoneyBoard fastMoney={fm} />}
      {!playing && !showBoard && (
        <div className={styles.wait}>
          <NumberDisplay value={fm.total} size="lg" />
        </div>
      )}
    </div>
  );
};
