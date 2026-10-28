import { otherSide } from '@/engines/feud/types';
import { AnswerBox } from './AnswerBox';
import type { RunCommand } from './FeudGame.types';
import { HostOnly } from './HostOnly';
import { faceOffIndex, podiumName } from './labels';
import type { FeudViewModel } from './types';
import styles from './FaceOffPanel.module.css';

export interface FaceOffPanelProps {
  view: FeudViewModel;
  showMode: boolean;
  onCommand: RunCommand;
}

/** Who faces off, whether the buzzers are open, who buzzed first and the play-or-pass call. */
export const FaceOffPanel = ({ view, showMode, onCommand }: FaceOffPanelProps) => {
  const { audience, teams } = view;
  const faceOff = audience.faceOff;
  const answering = audience.answering;
  let headline: string;
  let detail: string;
  let tone: 'ready' | 'open' | 'answer' | 'decide' = 'ready';

  if (audience.phase === 'play-or-pass' && faceOff?.winner != null) {
    tone = 'decide';
    headline = `${teams[faceOff.winner].name} won the face-off`;
    detail = 'Play or pass?';
  } else if (faceOff?.stage === 'buzzers-open') {
    tone = 'open';
    headline = 'BUZZERS OPEN';
    detail = 'First to buzz answers';
  } else if (answering !== null && faceOff?.first != null) {
    tone = 'answer';
    headline = `${teams[faceOff.first].name} buzzed first`;
    detail = `${teams[answering.side].name}: ${podiumName(view, answering.side, answering.playerIndex)}, your answer?`;
  } else {
    const a = faceOffIndex(view, 'A');
    const b = faceOffIndex(view, 'B');
    headline = `Give me ${podiumName(view, 'A', a)} and ${podiumName(view, 'B', b)}`;
    detail = `${teams.A.name} against ${teams[otherSide('A')].name}`;
  }

  return (
    <section className={styles.panel} data-tone={tone} aria-live="polite">
      <p className={styles.headline}>{headline}</p>
      <p className={styles.detail}>{detail}</p>
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
