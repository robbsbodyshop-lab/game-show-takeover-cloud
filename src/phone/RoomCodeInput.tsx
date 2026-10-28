import { useId, type ChangeEvent } from 'react';
import { Label } from '@/design';
import { ROOM_CODE_LENGTH } from '@/data/roomCode';
import { cleanRoomCode } from './phoneControls';
import styles from './phone.module.css';

export interface RoomCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called once when the 4th letter is typed or pasted (auto-advance). */
  onComplete: (value: string) => void;
}

/** One field that looks like four big letters; it filters as you type and advances when full. */
export const RoomCodeInput = ({ value, onChange, onComplete }: RoomCodeInputProps) => {
  const id = useId();
  const handle = (event: ChangeEvent<HTMLInputElement>) => {
    const next = cleanRoomCode(event.target.value);
    onChange(next);
    if (next.length === ROOM_CODE_LENGTH && next !== value) onComplete(next);
  };
  return (
    <div className={styles.field}>
      <Label htmlFor={id}>Room code</Label>
      <input
        id={id}
        className={`${styles.input} ${styles.codeInput}`}
        value={value}
        onChange={handle}
        maxLength={ROOM_CODE_LENGTH * 2}
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        autoFocus
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className={styles.hint}>
        4 letters, no vowels. It is on the game screen.
      </p>
    </div>
  );
};
