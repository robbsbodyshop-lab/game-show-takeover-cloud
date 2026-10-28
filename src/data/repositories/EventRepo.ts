import type { EventRecord, EventStateRecord, SaveStateResult } from '../types';

/** How long a stage's director lease survives without a heartbeat (0002_director_lease.sql default). */
export const DEFAULT_DIRECTOR_TTL_SECONDS = 30;

export type ClaimDirectorResult = { ok: true } | { ok: false; holderSeenAt: string | null };

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
  /**
   * Takes (or renews) the stage "director" lease of the event for `sessionId` (design.md TD-002).
   * Succeeds when the lease is free, already held by `sessionId` (a heartbeat), or has not been
   * renewed for more than `ttlSeconds` (default 30). Otherwise `{ ok: false, holderSeenAt }` says when
   * the live holder was last seen. Throws `DataError('forbidden')` when the event is not the caller's.
   */
  claimDirector(eventId: string, sessionId: string, ttlSeconds?: number): Promise<ClaimDirectorResult>;
  /** Clears the lease only when `sessionId` holds it; anything else (also a foreign event) is a no-op. */
  releaseDirector(eventId: string, sessionId: string): Promise<void>;
  /** Idempotent: deleting a missing or foreign event does nothing. */
  deleteEvent(id: string): Promise<void>;
}
