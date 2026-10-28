import { Marquee } from '@/design/Marquee';
import { NumberDisplay } from '@/design/NumberDisplay';
import { Panel } from '@/design/Panel';
import { otherSide } from '@/engines/feud/types';
import { FM_JACKPOT } from '@/engines/feud/fastMoney';
import type { FeudViewModel } from './types';
import styles from './GameOverCard.module.css';

export interface GameOverCardProps {
  view: FeudViewModel;
}

/** Points breakdown: game score, Fast Money, the total for the scoreboard, and what the loser keeps. */
export const GameOverCard = ({ view }: GameOverCardProps) => {
  const { audience, teams } = view;
  const winner = audience.gameWinner;
  if (winner === null) return null;
  const loser = otherSide(winner);
  const gameScore = audience.families[winner].score;
  const fastMoney = audience.fastMoney?.total ?? 0;
  const jackpot = audience.fastMoney?.outcome === 'jackpot' && fastMoney >= FM_JACKPOT;
  return (
    <Panel className={styles.card}>
      <Marquee as="h1">{`${teams[winner].name} win the match`}</Marquee>
      <dl className={styles.rows}>
        <div className={styles.row}>
          <dt>Game score</dt>
          <dd>
            <NumberDisplay value={gameScore} size="md" />
          </dd>
        </div>
        <div className={styles.row}>
          <dt>Fast Money</dt>
          <dd>
            <NumberDisplay value={fastMoney} size="md" />
          </dd>
        </div>
        <div className={styles.total}>
          <dt>To the scoreboard</dt>
          <dd>
            <NumberDisplay value={gameScore + fastMoney} size="lg" />
          </dd>
        </div>
      </dl>
      {jackpot && <p className={styles.jackpot}>JACKPOT: BONUS PLINKO CHIP</p>}
      <p className={styles.loser}>
        {teams[loser].name} keep {audience.families[loser].score} points
      </p>
      {view.endReported && <p className={styles.waiting}>Back to the event...</p>}
    </Panel>
  );
};
