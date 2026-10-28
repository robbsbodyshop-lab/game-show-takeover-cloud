import { AnswerBox } from './AnswerBox';
import type { RunCommand } from './FeudGame.types';
import { HostOnly } from './HostOnly';
import { podiumName } from './labels';
import type { FeudViewModel } from './types';
import styles from './FaceOffPanel.module.css';

export interface ControlPanelProps {
  view: FeudViewModel;
  showMode: boolean;
  onCommand: RunCommand;
}

/** The controlling family answers one player at a time; the strikes sit in its score box. */
export const ControlPanel = ({ view, showMode, onCommand }: ControlPanelProps) => {
  const { audience, teams } = view;
  const answering = audience.answering;
  const family = audience.control;
  return (
    <section className={styles.panel} data-tone="answer" aria-live="polite">
      <p className={styles.headline}>
        {family === null ? 'Keep it going' : `${teams[family].name} have the board`}
      </p>
      <p className={styles.detail}>
        {answering === null
          ? ''
          : `${podiumName(view, answering.side, answering.playerIndex)}, give me an answer`}
      </p>
      {view.answerBox.available && (
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
