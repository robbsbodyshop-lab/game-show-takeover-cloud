import { Button, Marquee, Panel, Stripes } from '@/design';
import type { EventRecord } from '@/data';
import type { EventSession } from '@/engines/event';
import { useConfirmTwice } from './useConfirmTwice';
import styles from './ResumePrompt.module.css';

export interface ResumePromptProps {
  event: EventRecord;
  session: EventSession;
  notice: string | null;
  onResume: () => void;
  onStartNew: () => void;
  onBack: () => void;
}

const PHASE_LABEL: Record<EventSession['phase'], string> = {
  setup: 'setting up',
  doors: 'at the door game',
  hub: 'at the hub',
  feud: 'in Family Feud',
  wheel: 'in Wheel of Fortune',
  speed: 'in the Speed Round',
  plinko: 'at Plinko',
  puzzle: 'in the Puzzle Game',
  winner: 'at the winner screen',
};

/** FR-006: opening an event that has progress offers Resume or Start a new event. */
export const ResumePrompt = ({ event, session, notice, onResume, onStartNew, onBack }: ResumePromptProps) => {
  const fresh = useConfirmTwice(onStartNew);
  return (
    <main className={styles.page}>
      <Panel className={styles.panel}>
        <Marquee as="h1">{event.name}</Marquee>
        <Stripes />
        <p>
          This event is {PHASE_LABEL[session.phase]} with {session.teams.length} teams.
        </p>
        {notice ? <p role="alert">{notice}</p> : null}
        <div className={styles.actions}>
          <Button variant="confirm" size="lg" onClick={onResume}>
            Resume
          </Button>
          <Button variant="danger" size="lg" onClick={fresh.trigger}>
            {fresh.armed ? 'Tap again: zero the scores' : 'Start a new event'}
          </Button>
          <Button variant="quiet" size="lg" onClick={onBack}>
            Back to my events
          </Button>
        </div>
      </Panel>
    </main>
  );
};
