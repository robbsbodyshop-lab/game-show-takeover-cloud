import { useState, type SyntheticEvent } from 'react';
import { Button, Label, Panel } from '@/design';
import { isValidRoomCode, normalizeRoomCode } from '@/data';
import styles from './HostPage.module.css';

export interface RoomCodeFormProps {
  onSubmit: (code: string) => void;
  /** Shown under the field, for example "Room not found". */
  error?: string | null;
  onSignOut?: () => void;
}

/** Room code entry for the host view (when the link has no `?room=`). */
export const RoomCodeForm = ({ onSubmit, error = null, onSignOut }: RoomCodeFormProps) => {
  const [value, setValue] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const code = normalizeRoomCode(value);
    if (!isValidRoomCode(code)) {
      setProblem('A room code is 4 letters, like BKDX. It is on the stage screen.');
      return;
    }
    setProblem(null);
    onSubmit(code);
  };

  const shown = problem ?? error;

  return (
    <main className={styles.page}>
      <Panel className={styles.gate}>
        <h1 className={styles.title}>Open the host view</h1>
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.field}>
            <Label htmlFor="host-room">Room code</Label>
            <input
              id="host-room"
              className={`${styles.input} ${styles.code}`}
              value={value}
              maxLength={8}
              autoComplete="off"
              autoCapitalize="characters"
              onChange={(e) => {
                setValue(e.target.value);
              }}
            />
          </div>
          {shown === null ? null : (
            <p className={styles.error} role="alert">
              {shown}
            </p>
          )}
          <div className={styles.row}>
            <Button type="submit">Connect</Button>
            {onSignOut === undefined ? null : (
              <Button variant="quiet" onClick={onSignOut}>
                Sign out
              </Button>
            )}
          </div>
        </form>
      </Panel>
    </main>
  );
};
