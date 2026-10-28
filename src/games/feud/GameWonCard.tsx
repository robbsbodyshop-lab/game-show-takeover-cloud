import { Marquee } from '@/design/Marquee';
import { Panel } from '@/design/Panel';
import { NumberDisplay } from '@/design/NumberDisplay';
import type { FeudViewModel } from './types';
import styles from './MatchCard.module.css';

export interface GameWonCardProps {
  view: FeudViewModel;
}

/** A family has won the game; the host chooses Play Fast Money or Skip. */
export const GameWonCard = ({ view }: GameWonCardProps) => {
  const winner = view.audience.gameWinner;
  if (winner === null) return null;
  const team = view.teams[winner];
  return (
    <Panel className={styles.card}>
      <Marquee as="h1">{`${team.name} win!`}</Marquee>
      <NumberDisplay value={view.audience.families[winner].score} size="xl" />
      <p className={styles.rule}>
        {view.audience.fastMoney === null ? 'The game is theirs' : 'On to Fast Money for 200 points'}
      </p>
    </Panel>
  );
};
