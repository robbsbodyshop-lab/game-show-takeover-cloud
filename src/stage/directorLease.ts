/**
 * The stage "director lease" (design.md section 3, TD-002; SQL in 0002_director_lease.sql).
 *
 * Exactly one stage per event may write game state and own the room. Every stage tab claims the lease
 * when it mounts and renews it every 10 s; a tab whose claim is refused is read-only. The lease
 * expires 30 s after the last heartbeat, so a crashed or closed tab never locks the event.
 *
 * Decisions:
 *  - A claim that THROWS (offline, signed out, server error) keeps the stage running as director and
 *    the heartbeat keeps trying: the show never stalls (P-001). Only a definite `{ ok: false }` demotes.
 *    The rev compare-and-set on event_state stays as the second line of defence.
 *  - Calls for one event are serialised inside the tab, so an unmount's release can never land after
 *    the next mount's claim and silently drop the lease (StrictMode, "Reload this event").
 *  - Release on unmount and `pagehide` is best effort (a closing page may cancel the request); the TTL
 *    is the real safety net.
 */
import type { EventRepo } from '@/data';
import { logger } from '@/lib/logger';

export const HEARTBEAT_INTERVAL_MS = 10_000;
const SESSION_KEY = 'gst:stage-session';

export type LeaseStatus = 'claiming' | 'director' | 'readonly';

export type LeaseRepo = Pick<EventRepo, 'claimDirector' | 'releaseDirector'>;

let fallbackSessionId: string | null = null;

/**
 * This tab's lease identity. Kept in sessionStorage so a reload of the same tab is still "the same
 * stage" (it can re-claim at once); a new tab has its own sessionStorage and therefore a new id.
 */
export function getTabSessionId(): string {
  try {
    const stored = globalThis.sessionStorage.getItem(SESSION_KEY);
    if (stored !== null && stored !== '') return stored;
    const created = globalThis.crypto.randomUUID();
    globalThis.sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    // Storage blocked: an id that lives as long as this page still separates the tabs.
    fallbackSessionId ??= globalThis.crypto.randomUUID();
    return fallbackSessionId;
  }
}

const queues = new Map<string, Promise<void>>();

function enqueue<T>(eventId: string, task: () => Promise<T>): Promise<T> {
  const run = (queues.get(eventId) ?? Promise.resolve()).then(task);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  queues.set(eventId, tail);
  void tail.then(() => {
    if (queues.get(eventId) === tail) queues.delete(eventId);
  });
  return run;
}

export interface DirectorLeaseOptions {
  events: LeaseRepo;
  eventId: string;
  sessionId: string;
  heartbeatMs?: number;
  /** Lease lifetime without a heartbeat; omitted means the server default (30 s). */
  ttlSeconds?: number;
  /** Called whenever the status changes (never synchronously from `start`). */
  onChange: (status: LeaseStatus) => void;
}

export class DirectorLease {
  private status: LeaseStatus = 'claiming';
  private running = false;
  private generation = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;
  private failing = false;

  constructor(private readonly options: DirectorLeaseOptions) {}

  getStatus(): LeaseStatus {
    return this.status;
  }

  /** Claims the lease and starts the heartbeat. Idempotent until `stop`. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.status = 'claiming';
    this.inFlight = false;
    const generation = ++this.generation;
    if (typeof window !== 'undefined') window.addEventListener('pagehide', this.onPageHide);
    void this.beat(generation);
  }

  /** Stops the heartbeat and gives the lease back (also when the claim is still in flight). */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.generation += 1;
    this.clearTimer();
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this.onPageHide);
    if (this.status !== 'readonly') this.release();
  }

  /** This stage lost the event to another one (a save conflict): read-only, lease handed back. */
  demote(): void {
    if (!this.running || this.status === 'readonly') return;
    this.clearTimer();
    this.release();
    this.setStatus('readonly');
  }

  // --- internals -----------------------------------------------------------------------------

  private readonly onPageHide = (): void => {
    if (this.running && this.status !== 'readonly') this.release();
  };

  private async beat(generation: number): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      const { events, eventId, sessionId, ttlSeconds } = this.options;
      const result = await enqueue(eventId, () => events.claimDirector(eventId, sessionId, ttlSeconds));
      if (generation !== this.generation) return;
      this.failing = false;
      if (result.ok) this.hold();
      else this.lose();
    } catch (error) {
      if (generation !== this.generation) return;
      if (!this.failing) logger.warn('[stage] director lease: claim failed, staying director', error);
      this.failing = true;
      this.hold();
    } finally {
      if (generation === this.generation) this.inFlight = false;
    }
  }

  /** Granted (or assumed, when the server cannot be reached): director, and keep renewing. */
  private hold(): void {
    this.timer ??= setInterval(() => {
      void this.beat(this.generation);
    }, this.options.heartbeatMs ?? HEARTBEAT_INTERVAL_MS);
    this.setStatus('director');
  }

  /** Refused: somebody else is the director. Stop renewing; "Reload this event" claims again. */
  private lose(): void {
    this.clearTimer();
    this.setStatus('readonly');
  }

  private release(): void {
    const { events, eventId, sessionId } = this.options;
    enqueue(eventId, () => events.releaseDirector(eventId, sessionId)).catch((error: unknown) => {
      logger.warn('[stage] director lease: release failed', error);
    });
  }

  private clearTimer(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private setStatus(status: LeaseStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.options.onChange(status);
  }
}
