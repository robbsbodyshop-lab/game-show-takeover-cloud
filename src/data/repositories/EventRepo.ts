import type { EventRecord, EventStateRecord, SaveStateResult } from '../types';

/** Events owned by the signed-in host and their saved state (design.md sections 4 and 7). */
export interface EventRepo {
  /** The caller's events, newest first. */
  listEvents(): Promise<EventRecord[]>;
  /** Creates an event in status `setup` with an empty save slot (rev 0, state null). */
  createEvent(name: string): Promise<EventRecord>;
  /** `null` when the event does not exist or belongs to someone else. */
  getEvent(id: string): Promise<EventRecord | null>;
  /** `null` when the event does not exist or belongs to someone else. */
  loadState(id: string): Promise<EventStateRecord | null>;
  /**
   * Compare-and-set save. Writes `state` with rev = expectedRev + 1 only when the stored rev equals
   * `expectedRev`; otherwise returns `{ ok: false, reason: 'conflict' }` (another stage saved).
   * Throws `DataError('not_found')` when the event is not the caller's.
   */
  saveState(id: string, state: unknown, expectedRev: number): Promise<SaveStateResult>;
  /** Sets status `finished`. Throws `DataError('not_found')` when the event is not the caller's. */
  finishEvent(id: string): Promise<void>;
  /** Idempotent: deleting a missing or foreign event does nothing. */
  deleteEvent(id: string): Promise<void>;
}
