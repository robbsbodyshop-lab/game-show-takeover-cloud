import { Panel } from '@/design';
import type { PlateUi } from './WheelController';
import styles from './ResultPlate.module.css';

export interface ResultPlateProps {
  plate: PlateUi;
  teamName: string;
}

const TEXT: Record<PlateUi['kind'], { title: string; line: (team: string) => string }> = {
  bankrupt: { title: 'BANKRUPT', line: (t) => `${t} loses the round's cash and prizes.` },
  'lose-turn': { title: 'LOSE A TURN', line: (t) => `${t} passes the wheel.` },
  'wild-card': { title: 'WILD CARD', line: (t) => `${t} claims the Wild Card.` },
  million: { title: 'ONE MILLION', line: (t) => `${t} claims the Million Dollar Wedge.` },
  'mystery-win': { title: '$10,000', line: (t) => `${t} flips the Mystery wedge to a $10,000 prize.` },
};

/** The big plate for Bankrupt, Lose a Turn and the specials claimed (flat, hard-shadowed, stepped). */
export const ResultPlate = ({ plate, teamName }: ResultPlateProps) => {
  const text = TEXT[plate.kind];
  return (
    <Panel className={styles.plate} data-kind={plate.kind} role="status" data-testid="result-plate">
      <h2 className={styles.title}>{text.title}</h2>
      <p className={styles.line}>{text.line(teamName)}</p>
    </Panel>
  );
};
