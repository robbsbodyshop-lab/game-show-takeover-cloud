import { z } from 'zod';
import { logger } from '../lib/logger';
import type { EventRepo } from './repositories/EventRepo';
import type { EventStateRecord } from './types';

/**
 * Debounced, revision-guarded saving of an event's state (design.md section 7).
 *
 *  - `save(state)` keeps only the newest state and writes it 500 ms after the last call.
 *  - The page flushes immediately on `visibilitychange` (hidden) and `pagehide`.
 *  - Writes are serialised and carry the revision this tab last saw. A conflict means another
 *    stage saved first: this tab stops saving and calls `onConflict` (the caller demotes it).
 *  - Every `save()` also stores the state in localStorage (`gst:cache:<eventId>`) so a reload can
 *    render before the cloud copy arrives. Storage failures are ignored.
 */

export const DEFAULT_DEBOUNCE_MS = 500;
/** A change stream faster than the debounce (engine ticks) must still reach the cloud within 2 s (FR-004). */
export const DEFAULT_MAX_WAIT_MS = 2000;
const MAX_RETRIES = 5;
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30_000;

export type PersistenceRepo = Pick<EventRepo, 'loadState' | 'saveState'>;

export type CacheStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface PersistenceOptions {
  debounceMs?: number;
  /** Upper bound between the first unsaved change and the save, whatever the debounce. */
  maxWaitMs?: number;
  /** Revision the cloud copy had when this tab started (default 0, the rev of a fresh event). */
  initialRev?: number;
  /** Another stage saved first. Saving stops until `load()` is called again. */
  onConflict?: () => void;
  /** A save succeeded and the cloud is now at `rev`. */
  onSaved?: (rev: number) => void;
  /** A save threw (offline, RLS, ...). The state is kept and retried with backoff. */
  onError?: (error: unknown) => void;
  /** Defaults to window.localStorage; pass `null` to disable the cache. */
  storage?: CacheStorage | null;
  maxRetries?: number;
}

export interface Persistence {
  /** Loads the cloud copy, adopts its rev and clears a previous conflict. */
  load(): Promise<EventStateRecord | null>;
  save(state: unknown): void;
  /** Writes any pending state now. Resolves when the write (and any write queued before it) is done. */
  flush(): Promise<void>;
  getRev(): number;
  hasConflict(): boolean;
  /** Flushes pending state (fire and forget), stops timers and removes page listeners. */
  dispose(): void;
}

const cachedStateSchema = z.object({
  rev: z.number().int().nonnegative(),
  state: z.unknown(),
  savedAt: z.string(),
  synced: z.boolean(),
});

export interface CachedState {
  /** Cloud revision this state was based on (or is, when `synced`). */
  rev: number;
  state: unknown;
  savedAt: string;
  /** True when the cloud holds exactly this state at `rev`. */
  synced: boolean;
}

export function cacheKey(eventId: string): string {
  return `gst:cache:${eventId}`;
}

function defaultStorage(): CacheStorage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function readCache(storage: CacheStorage | null, eventId: string): CachedState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(cacheKey(eventId));
    if (raw === null) return null;
    const parsed = cachedStateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    return {
      rev: parsed.data.rev,
      state: parsed.data.state,
      savedAt: parsed.data.savedAt,
      synced: parsed.data.synced,
    };
  } catch {
    return null;
  }
}

function writeCache(storage: CacheStorage | null, eventId: string, entry: CachedState): void {
  if (!storage) return;
  try {
    storage.setItem(cacheKey(eventId), JSON.stringify(entry));
  } catch (error) {
    logger.debug('persistence: cache write failed', error);
  }
}

/** The last state this browser stored for `eventId`, or null (also when storage is unavailable). */
export function loadCached(
  eventId: string,
  storage: CacheStorage | null = defaultStorage(),
): CachedState | null {
  return readCache(storage, eventId);
}

export function clearCached(eventId: string, storage: CacheStorage | null = defaultStorage()): void {
  try {
    storage?.removeItem(cacheKey(eventId));
  } catch {
    // Nothing to do: the cache is only a convenience.
  }
}

export function createPersistence(
  repo: PersistenceRepo,
  eventId: string,
  options: PersistenceOptions = {},
): Persistence {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const maxRetries = options.maxRetries ?? MAX_RETRIES;
  const storage = options.storage === undefined ? defaultStorage() : options.storage;

  let rev = options.initialRev ?? 0;
  let conflicted = false;
  let disposed = false;
  let hasPending = false;
  let pendingState: unknown;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();

  // A function, not the variable: control-flow analysis cannot see that save() may set it during an await.
  const isPending = (): boolean => hasPending;

  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (maxWaitTimer !== null) {
      clearTimeout(maxWaitTimer);
      maxWaitTimer = null;
    }
  };

  /** Trailing debounce with a ceiling: the first change in a burst arms a timer the burst cannot postpone. */
  const scheduleDebounced = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, debounceMs);
    maxWaitTimer ??= setTimeout(() => {
      maxWaitTimer = null;
      void flush();
    }, maxWaitMs);
  };

  const schedule = (delayMs: number): void => {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, delayMs);
  };

  const run = async (): Promise<void> => {
    if (conflicted || !hasPending) return;
    const state = pendingState;
    hasPending = false;
    pendingState = undefined;
    try {
      const result = await repo.saveState(eventId, state, rev);
      if (result.ok) {
        rev = result.rev;
        failures = 0;
        if (!isPending()) {
          writeCache(storage, eventId, { rev, state, savedAt: new Date().toISOString(), synced: true });
        }
        options.onSaved?.(rev);
      } else {
        conflicted = true;
        hasPending = false;
        pendingState = undefined;
        clearTimer();
        options.onConflict?.();
      }
    } catch (error) {
      failures += 1;
      options.onError?.(error);
      logger.warn('persistence: save failed', error);
      if (!isPending()) {
        hasPending = true;
        pendingState = state;
      }
      if (!disposed && failures <= maxRetries) {
        schedule(Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (failures - 1)));
      }
    }
  };

  function flush(): Promise<void> {
    clearTimer();
    chain = chain.then(run);
    return chain;
  }

  // Declared optional so the module also loads outside a browser (SSR, plain Node).
  const doc = (globalThis as { document?: Document }).document;
  const win = (globalThis as { window?: Window }).window;

  const onVisibilityChange = (): void => {
    if (doc?.visibilityState === 'hidden') void flush();
  };
  const onPageHide = (): void => {
    void flush();
  };

  doc?.addEventListener('visibilitychange', onVisibilityChange);
  win?.addEventListener('pagehide', onPageHide);

  return {
    async load() {
      const record = await repo.loadState(eventId);
      if (record) rev = record.rev;
      conflicted = false;
      failures = 0;
      return record;
    },

    save(state) {
      if (conflicted || disposed) return;
      hasPending = true;
      pendingState = state;
      writeCache(storage, eventId, { rev, state, savedAt: new Date().toISOString(), synced: false });
      scheduleDebounced();
    },

    flush,

    getRev: () => rev,

    hasConflict: () => conflicted,

    dispose() {
      if (disposed) return;
      void flush();
      disposed = true;
      clearTimer();
      if (typeof document !== 'undefined')
        document.removeEventListener('visibilitychange', onVisibilityChange);
      win?.removeEventListener('pagehide', onPageHide);
    },
  };
}
