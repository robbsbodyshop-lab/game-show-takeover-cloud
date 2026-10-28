import { useId, useState, type SyntheticEvent } from 'react';
import { Button } from '@/design/Button';
import { Label } from '@/design/Label';
import styles from './AnswerBox.module.css';

export interface AnswerBoxProps {
  /** The typed answer; Enter or the button judges it. */
  onSubmit: (text: string) => void;
  /** Called on every keystroke so the answer timer holds and the microphone steps aside. */
  onTyping: () => void;
  label?: string;
}

/** Host-only box for the player's answer (stage or console). Typed answers never submit on their own. */
export const AnswerBox = ({ onSubmit, onTyping, label = 'Type the answer' }: AnswerBoxProps) => {
  const [text, setText] = useState('');
  const id = useId();

  const submit = (event: SyntheticEvent): void => {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed === '') return;
    onSubmit(trimmed);
    setText('');
  };

  return (
    <form className={styles.box} onSubmit={submit}>
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        className={styles.input}
        value={text}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          setText(event.target.value);
          onTyping();
        }}
      />
      <Button type="submit" variant="host" size="md">
        Judge
      </Button>
    </form>
  );
};
