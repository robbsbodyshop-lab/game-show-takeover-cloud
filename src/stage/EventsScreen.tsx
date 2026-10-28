import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import { Button, Inset, Label, Marquee, Panel, Stripes } from '@/design';
import type { AuthUser, DataLayer, EventRecord } from '@/data';
import { logger } from '@/lib/logger';
import { EventRow } from './EventRow';
import { TextField } from './TextField';
import styles from './EventsScreen.module.css';

export interface EventsScreenProps {
  data: DataLayer;
  user: AuthUser;
  onOpen: (eventId: string) => void;
  onSignOut: () => void;
}

const MAX_NAME = 120;

/** FR-002, FR-006: the signed-in host's events, newest first; create, open, delete (two taps). */
export const EventsScreen = ({ data, user, onOpen, onSignOut }: EventsScreenProps) => {
  const [events, setEvents] = useState<EventRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    data.events
      .listEvents()
      .then((list) => {
        if (active) setEvents(list);
      })
      .catch((error: unknown) => {
        logger.warn('[stage] listing events failed', error);
        if (active) setLoadError('Your events could not be loaded. Check your connection and reload.');
      });
    return () => {
      active = false;
    };
  }, [data]);

  const create = (event: SyntheticEvent): void => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setNameError('Give the event a name.');
      return;
    }
    if (trimmed.length > MAX_NAME) {
      setNameError(`Use ${String(MAX_NAME)} characters or fewer.`);
      return;
    }
    setNameError(null);
    setBusy(true);
    data.events
      .createEvent(trimmed)
      .then((created) => {
        setEvents((prev) => [created, ...(prev ?? [])]);
        setName('');
        onOpen(created.id);
      })
      .catch((error: unknown) => {
        logger.warn('[stage] creating the event failed', error);
        setNameError('The event could not be created. Try again.');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const remove = useCallback(
    (id: string) => {
      setEvents((prev) => (prev ? prev.filter((e) => e.id !== id) : prev));
      data.events.deleteEvent(id).catch((error: unknown) => {
        logger.warn('[stage] deleting the event failed', error);
        setLoadError('The event could not be deleted. Reload to see the current list.');
      });
    },
    [data],
  );

  return (
    <main className={styles.page}>
      <Panel className={styles.panel}>
        <Marquee as="h1">Your events</Marquee>
        <Stripes />
        <div className={styles.account}>
          <span>{user.email ?? 'Signed in'}</span>
          <Button variant="quiet" size="sm" onClick={onSignOut}>
            Sign out
          </Button>
        </div>

        <form className={styles.create} onSubmit={create} noValidate>
          <TextField
            label="New event name"
            value={name}
            onChange={setName}
            error={nameError}
            maxLength={MAX_NAME}
            placeholder="Friday trivia night"
            disabled={busy}
            className={styles.nameField}
          />
          <Button type="submit" variant="confirm" disabled={busy}>
            Create event
          </Button>
        </form>

        <Inset className={styles.list}>
          <Label>Events, newest first</Label>
          {loadError ? (
            <p role="alert" className={styles.error}>
              {loadError}
            </p>
          ) : null}
          {events === null && !loadError ? <p>Loading your events...</p> : null}
          {events?.length === 0 ? <p>No events yet. Create one to get started.</p> : null}
          {events && events.length > 0 ? (
            <ul className={styles.items} aria-label="Events">
              {events.map((event) => (
                <EventRow key={event.id} event={event} onOpen={onOpen} onDelete={remove} />
              ))}
            </ul>
          ) : null}
        </Inset>
      </Panel>
    </main>
  );
};
