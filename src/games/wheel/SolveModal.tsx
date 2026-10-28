import { useId, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { Button, Dialog, Label } from '@/design';
import styles from './SolveModal.module.css';

export interface SolveModalProps {
  open: boolean;
  teamName: string;
  /** A close answer is waiting for the host (the text itself is never shown here). */
  judging: boolean;
  /** Typed answer: the controller judges it word for word (FR-041). */
  onSubmit: (answer: string) => void;
  /** "Heard it?" rulings. */
  onRule: (verdict: 'correct' | 'wrong') => void;
  /** Close answer rulings. */
  onAccept: () => void;
  onReject: () => void;
  /** Close the box unanswered: the solve is cancelled and the clock goes on. */
  onCancel: () => void;
  /** A toss-up answer or Bonus guess cannot be taken back, so there is nothing to cancel. */
  cancelLabel?: string;
}

/**
 * The solve box (FR-024/041): a text box judged on submit, or "Heard it? Correct / Wrong" when the host
 * heard the answer aloud. A close answer comes back as Accept / Reject.
 */
export const SolveModal = ({
  open,
  teamName,
  judging,
  onSubmit,
  onRule,
  onAccept,
  onReject,
  onCancel,
  cancelLabel = 'Cancel',
}: SolveModalProps) => {
  const [text, setText] = useState('');
  const inputId = useId();
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const answer = text.trim();
    if (answer === '') return;
    onSubmit(answer);
    setText('');
  };
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={`${teamName}: SOLVE`}
      dismissOnBackdrop={false}
      className={styles.dialog}
    >
      {judging ? (
        <div className={styles.judging} role="status">
          <p className={styles.close}>Close, but not word for word. Your call, host.</p>
          <div className={styles.actions}>
            <Button variant="confirm" onClick={onAccept}>
              Accept
            </Button>
            <Button variant="danger" onClick={onReject}>
              Reject
            </Button>
          </div>
        </div>
      ) : (
        <>
          <form onSubmit={submit} className={styles.form}>
            <Label htmlFor={inputId}>Type the answer</Label>
            <input
              id={inputId}
              className={styles.input}
              value={text}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              onChange={(e) => {
                setText(e.target.value);
              }}
            />
            <Button type="submit" variant="primary" disabled={text.trim() === ''}>
              Check answer
            </Button>
          </form>
          <div className={styles.heard}>
            <Label>Heard it?</Label>
            <div className={styles.actions}>
              <Button
                variant="confirm"
                onClick={() => {
                  onRule('correct');
                }}
              >
                Correct
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  onRule('wrong');
                }}
              >
                Wrong
              </Button>
            </div>
          </div>
        </>
      )}
      <div className={styles.footer}>
        <Button variant="quiet" onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </Dialog>
  );
};
