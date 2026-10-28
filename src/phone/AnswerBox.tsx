import { useId, useState, type KeyboardEvent, type SyntheticEvent } from 'react';
import { Button, Label } from '@/design';
import styles from './AnswerBox.module.css';
import shared from './phone.module.css';

export interface AnswerBoxProps {
  title: string;
  submitLabel: string;
  maxLength: number;
  onSubmit: (text: string) => void;
  /** Adds a cancel button (and Escape) that calls this. */
  onCancel?: () => void;
  cancelLabel?: string;
  /** Empty the field after sending and say "Sent" (Feud answers; a solve closes the box instead). */
  keepOpenAfterSubmit?: boolean;
}

/** A text box with a submit button, used for SOLVE and for Feud answers typed on the phone. */
export const AnswerBox = ({
  title,
  submitLabel,
  maxLength,
  onSubmit,
  onCancel,
  cancelLabel = 'Cancel',
  keepOpenAfterSubmit = false,
}: AnswerBoxProps) => {
  const id = useId();
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const trimmed = text.trim();

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (trimmed === '') return;
    onSubmit(trimmed.slice(0, maxLength));
    if (keepOpenAfterSubmit) {
      setText('');
      setSent(true);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && onCancel) onCancel();
  };

  return (
    <form className={styles.box} onSubmit={submit} onKeyDown={onKeyDown}>
      <Label htmlFor={id}>{title}</Label>
      <input
        id={id}
        className={shared.input}
        value={text}
        maxLength={maxLength}
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        enterKeyHint="send"
        onChange={(event) => {
          setText(event.target.value);
          setSent(false);
        }}
      />
      {sent ? (
        <p role="status" className={shared.hint}>
          Sent
        </p>
      ) : null}
      <div className={shared.row}>
        <Button type="submit" variant="confirm" size="lg" disabled={trimmed === ''}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button variant="quiet" size="lg" onClick={onCancel}>
            {cancelLabel}
          </Button>
        ) : null}
      </div>
    </form>
  );
};
