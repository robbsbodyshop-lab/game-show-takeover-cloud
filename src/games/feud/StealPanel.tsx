import { AnswerBox } from './AnswerBox';
import type { RunCommand } from './FeudGame.types';
import { HostOnly } from './HostOnly';
import type { FeudViewModel } from './types';
import styles from './FaceOffPanel.module.css';

export interface StealPanelProps {
  view: FeudViewModel;
  showMode: boolean;
  onCommand: RunCommand;
}

/**
 * Three strikes: the other family confers ("HUDDLE", no clock for the audience), then its captain
 * gives one answer. The clock lives in the host console only (FR-036).
 */
export const StealPanel = ({ view, showMode, onCommand }: StealPanelProps) => {
  const { audience, teams } = view;
  const stealing = audience.stealing;
  const conferring = audience.phase === 'steal-confer';
  const name = stealing === null ? '' : teams[stealing].name;
  return (
    <section className={styles.panel} data-tone={conferring ? 'open' : 'answer'} aria-live="polite">
      <p className={styles.headline}>{conferring ? 'STEAL! HUDDLE' : 'THE STEAL'}</p>
      <p className={styles.detail}>
        {conferring ? `${name}: talk it over` : `${name} captain: one answer to steal the bank`}
      </p>
      {view.answerBox.available && !conferring && (
        <HostOnly showMode={showMode} className={styles.host}>
          <AnswerBox
            onSubmit={(text) => {
              onCommand('submit-text', { text });
            }}
            onTyping={() => {
              onCommand('hold-answer');
            }}
          />
        </HostOnly>
      )}
    </section>
  );
};
