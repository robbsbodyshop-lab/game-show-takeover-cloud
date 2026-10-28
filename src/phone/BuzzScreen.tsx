import { AnswerBox } from './AnswerBox';
import {
  buzzPresentation,
  canTypeAnswer,
  BUZZ_LABEL,
  NOT_CONNECTED_LABEL,
  TYPE_YOUR_ANSWER,
  type PhoneControls,
} from './phoneControls';
import type { BuzzFeedback } from './useStageLink';
import styles from './BuzzScreen.module.css';

export interface BuzzScreenProps {
  controls: PhoneControls | null;
  team: number;
  /** Team colour, drawn as a ring around the button. */
  color: string;
  connected: boolean;
  feedback: BuzzFeedback;
  onBuzz: () => void;
  onFeudAnswer: (text: string) => void;
}

export const BUZZED_LABEL = 'BUZZED!';
export const BUZZED_WAITING_LABEL = 'Buzzed (waiting…)';

type View = 'live' | 'waiting' | 'flash' | 'off';

/**
 * One huge BUZZ button (at least 60% of the viewport height). States: live, optimistic
 * "Buzzed (waiting...)", "BUZZED!" after an accepted ack, or grey with the stage's reason. When the
 * stage offers typing (`offLabel === TYPE_YOUR_ANSWER`) the Feud answer box replaces the button.
 */
export const BuzzScreen = ({
  controls,
  team,
  color,
  connected,
  feedback,
  onBuzz,
  onFeudAnswer,
}: BuzzScreenProps) => {
  if (connected && canTypeAnswer(controls, team)) {
    return (
      <section className={styles.typing} aria-label={TYPE_YOUR_ANSWER}>
        <AnswerBox
          title={TYPE_YOUR_ANSWER}
          submitLabel="Send"
          maxLength={300}
          keepOpenAfterSubmit
          onSubmit={onFeudAnswer}
        />
      </section>
    );
  }

  const presentation = connected
    ? buzzPresentation(controls, team)
    : { live: false, label: NOT_CONNECTED_LABEL };
  // An accepted ack is shown even if the stage has already switched the buzzers off.
  const view: View =
    feedback === 'flash'
      ? 'flash'
      : presentation.live
        ? feedback === 'waiting'
          ? 'waiting'
          : 'live'
        : 'off';
  const label =
    view === 'flash'
      ? BUZZED_LABEL
      : view === 'waiting'
        ? BUZZED_WAITING_LABEL
        : view === 'live'
          ? BUZZ_LABEL
          : presentation.label;

  return (
    <section className={styles.wrap} aria-label="Buzzer">
      <div className={styles.ring} style={{ borderColor: color }}>
        <button
          type="button"
          className={styles.buzz}
          data-view={view}
          disabled={view === 'off'}
          onClick={() => {
            if (presentation.live) onBuzz();
          }}
        >
          {label}
        </button>
      </div>
    </section>
  );
};
