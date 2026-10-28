import { useState, type SyntheticEvent } from 'react';
import { Button, Marquee, Panel, Stripes } from '@/design';
import { ROOM_CODE_LENGTH } from '@/data/roomCode';
import { JOIN_MESSAGES } from './phoneControls';
import { RoomCodeInput } from './RoomCodeInput';
import type { JoinError } from './usePhoneFlow';
import styles from './phone.module.css';

export interface JoinScreenProps {
  initialCode: string;
  error: JoinError | null;
  onSubmit: (code: string) => void;
  /** Clears the stored room and the typed code. */
  onChangeRoom: () => void;
}

/** Type the 4-letter room code. Mount under a changing `key` so a new error shows afresh. */
export const JoinScreen = ({ initialCode, error, onSubmit, onChangeRoom }: JoinScreenProps) => {
  const [code, setCode] = useState(initialCode);
  const [edited, setEdited] = useState(false);
  const message = error !== null && !edited ? JOIN_MESSAGES[error] : null;

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (code.length === ROOM_CODE_LENGTH) onSubmit(code);
  };

  return (
    <main className={styles.page}>
      <Marquee as="h1" className={styles.title}>
        Join the game
      </Marquee>
      <Panel className={styles.panel}>
        <Stripes />
        <form className={styles.form} onSubmit={submit} noValidate>
          <RoomCodeInput
            value={code}
            onChange={(next) => {
              setEdited(true);
              setCode(next);
            }}
            onComplete={onSubmit}
          />
          {message === null ? null : (
            <p role="alert" className={styles.error}>
              {message}
            </p>
          )}
          <Button type="submit" size="lg" disabled={code.length !== ROOM_CODE_LENGTH}>
            Join
          </Button>
        </form>
        {error === null ? null : (
          <Button
            variant="quiet"
            onClick={() => {
              setCode('');
              setEdited(true);
              onChangeRoom();
            }}
          >
            Change room
          </Button>
        )}
      </Panel>
    </main>
  );
};
