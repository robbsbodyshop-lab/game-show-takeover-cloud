import { Badge, Button } from '@/design';
import { AnswerBox } from './AnswerBox';
import type { PhoneControls } from './phoneControls';
import type { ActionNote } from './useStageLink';
import styles from './PodiumScreen.module.css';

export interface PodiumScreenProps {
  controls: PhoneControls;
  connected: boolean;
  /** The answer box is open (the solve has started). */
  solving: boolean;
  note: ActionNote;
  onBuy: () => void;
  onSpin: () => void;
  onSolveStart: () => void;
  onSolveCancel: () => void;
  onSolveSubmit: (answer: string) => void;
}

export const MAX_SOLVE_LENGTH = 200;

/** BUY, SPIN and SOLVE for the team at the wheel; SOLVE opens an answer box. */
export const PodiumScreen = ({
  controls,
  connected,
  solving,
  note,
  onBuy,
  onSpin,
  onSolveStart,
  onSolveCancel,
  onSolveSubmit,
}: PodiumScreenProps) => (
  <section className={styles.wrap} aria-label="Podium">
    <div className={styles.turn}>
      <Badge tone="gold">Your turn</Badge>
      {controls.turnName === '' ? null : <span className={styles.turnName}>{controls.turnName}</span>}
    </div>
    {solving ? (
      <AnswerBox
        title="Solve the puzzle"
        submitLabel="Submit"
        maxLength={MAX_SOLVE_LENGTH}
        onSubmit={onSolveSubmit}
        onCancel={onSolveCancel}
      />
    ) : (
      <div className={styles.actions}>
        <Button
          variant="host"
          size="lg"
          className={styles.big}
          disabled={!connected || !controls.canBuy}
          onClick={onBuy}
        >
          Buy
        </Button>
        <Button size="lg" className={styles.big} disabled={!connected || !controls.canSpin} onClick={onSpin}>
          Spin
        </Button>
        <Button
          variant="confirm"
          size="lg"
          className={styles.big}
          disabled={!connected || !controls.canSolve}
          onClick={onSolveStart}
        >
          Solve
        </Button>
      </div>
    )}
    <p role="status" className={styles.note}>
      {note === 'sent' ? 'Sent' : note === 'refused' ? 'Not right now' : ' '}
    </p>
  </section>
);
