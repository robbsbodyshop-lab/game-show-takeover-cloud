import { Badge, Button, Marquee, Panel, Stripes } from '@/design';
import type { EventRecord } from '@/data';
import { standings, winnerTeam, type EventSession } from '@/engines/event';
import styles from './FinishedEventView.module.css';

export interface FinishedEventViewProps {
  event: EventRecord;
  session: EventSession;
  onBack: () => void;
}

/** FR-006: a finished event stays readable: final scores, chips and the winner. */
export const FinishedEventView = ({ event, session, onBack }: FinishedEventViewProps) => {
  const winner = winnerTeam(session);
  return (
    <main className={styles.page}>
      <Panel className={styles.panel}>
        <Marquee as="h1">{event.name}</Marquee>
        <Stripes />
        <p className={styles.winner} role="status">
          {winner ? `Winner: ${winner.name}` : 'No single winner: the top score was tied.'}
        </p>
        <ol className={styles.list} aria-label="Final standings">
          {standings(session).map(({ team, rank }) => (
            <li key={team.id} className={styles.row} style={{ borderLeftColor: team.color }}>
              <Badge tone={rank === 1 ? 'gold' : 'cream'}>{rank}</Badge>
              <span className={styles.name}>{team.name}</span>
              <span>{team.score} points</span>
              <span className={styles.chips}>{team.chips} chips</span>
            </li>
          ))}
        </ol>
        <Button variant="secondary" onClick={onBack}>
          Back to my events
        </Button>
      </Panel>
    </main>
  );
};
