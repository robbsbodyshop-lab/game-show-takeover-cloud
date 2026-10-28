import { useEffect, useRef, useState } from 'react';
import { createPersistence, type DataLayer, type Persistence } from '@/data';
import type { EventSession } from '@/engines/event';

export interface UseSessionPersistenceOptions {
  data: DataLayer;
  eventId: string;
  session: EventSession;
  /** Revision of the cloud copy when this stage started. */
  initialRev: number;
  /** Save the starting state at once (it came from the cache, or the host started a new event). */
  saveOnMount: boolean;
  /** Another stage saved first: this one is no longer the director (design.md TD-002). */
  onConflict: () => void;
}

/** Debounced, revision-guarded saving of every session change (FR-004, design.md §7). */
export function useSessionPersistence(options: UseSessionPersistenceOptions): { saveFailing: boolean } {
  const { data, eventId, session, initialRev, saveOnMount, onConflict } = options;
  const [saveFailing, setSaveFailing] = useState(false);
  const persistence = useRef<Persistence | null>(null);
  const lastSaved = useRef<EventSession | null>(saveOnMount ? null : session);
  const conflictRef = useRef(onConflict);

  useEffect(() => {
    conflictRef.current = onConflict;
  });

  useEffect(() => {
    const created = createPersistence(data.events, eventId, {
      initialRev,
      onConflict: () => {
        conflictRef.current();
      },
      onSaved: () => {
        setSaveFailing(false);
      },
      onError: () => {
        setSaveFailing(true);
      },
    });
    persistence.current = created;
    return () => {
      created.dispose();
      persistence.current = null;
    };
  }, [data, eventId, initialRev]);

  useEffect(() => {
    if (lastSaved.current === session) return;
    lastSaved.current = session;
    persistence.current?.save(session);
  }, [session]);

  return { saveFailing };
}
