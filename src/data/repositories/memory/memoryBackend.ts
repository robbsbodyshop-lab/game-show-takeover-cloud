import { DataError } from '../../errors';
import { generateRoomCode, isValidRoomCode } from '../../roomCode';
import type { AuthSession, AuthUser, EventRecord, EventStateRecord, HostSettingsRecord } from '../../types';

/**
 * Shared in-memory "database" for demo mode and tests. It mirrors the rules of 0001_init.sql
 * (ownership, rev compare-and-set, director lease, room codes, 12 h expiry, 5 failures / 10 min join limit) so a
 * contract test run against it means the same thing as one run against Supabase.
 * State lives in one JS context: another browser tab gets its own, empty backend.
 */

export const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
export const JOIN_WINDOW_MS = 10 * 60 * 1000;
export const JOIN_MAX_FAILURES = 5;

/** The slice of `Storage` the backend uses. */
export type BackendStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Where the demo database lives in `localStorage` (one key, the whole state). */
export const MEMORY_STORAGE_KEY = 'gst:demo:db';
export const SAVE_DEBOUNCE_MS = 100;

export interface MemoryBackendOptions {
  now?: () => number;
  random?: () => number;
  newId?: () => string;
  /**
   * Where to persist the whole state (`gst:demo:db`). Omitted or `null`: purely in memory, which is
   * what tests want. The app passes `browserStorage()` so demo data survives a reload (FR-005).
   * Reads and writes are wrapped in try/catch: a full, blocked or corrupt store never breaks the app.
   */
  storage?: BackendStorage | null;
  /** Debounce of the save after a mutation (default 100 ms). */
  saveDebounceMs?: number;
}

export interface MemoryRoom {
  code: string;
  eventId: string;
  ownerId: string;
  createdAt: number;
  lastSeenAt: number;
}

export interface MemoryMember {
  roomCode: string;
  userId: string;
  role: 'stage' | 'host' | 'phone';
  team: number | null;
  nickname: string | null;
}

/** The stage director lease of one event (events.director_session / director_seen_at). */
export interface MemoryDirector {
  session: string;
  /** Milliseconds since the epoch, from the backend clock. */
  seenAt: number;
}

export interface MemoryUser extends AuthUser {
  password: string | null;
}

export interface MemoryBackend {
  readonly now: () => number;
  readonly random: () => number;
  readonly newId: () => string;
  users: Map<string, MemoryUser>;
  session: AuthSession | null;
  listeners: Set<(session: AuthSession | null) => void>;
  events: Map<string, EventRecord>;
  states: Map<string, EventStateRecord>;
  directors: Map<string, MemoryDirector>;
  settings: Map<string, HostSettingsRecord>;
  rooms: Map<string, MemoryRoom>;
  members: Map<string, MemoryMember>;
  attempts: Map<string, number[]>;
  /** Something may have changed: save the state to the storage shortly (debounced, no-op without one). */
  touch: () => void;
  /** Save now if a save is pending. */
  flush: () => void;
}

/** `window.localStorage`, or `null` where it does not exist or throws (private mode, SSR, Node). */
export function browserStorage(): BackendStorage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

const SNAPSHOT_VERSION = 1;
const SNAPSHOT_MAPS = [
  'users',
  'events',
  'states',
  'directors',
  'settings',
  'rooms',
  'members',
  'attempts',
] as const;

function serialize(backend: MemoryBackend): string {
  const snapshot: Record<string, unknown> = { v: SNAPSHOT_VERSION, session: backend.session };
  for (const name of SNAPSHOT_MAPS) snapshot[name] = [...backend[name]];
  return JSON.stringify(snapshot);
}

/** Fills `backend` from a stored snapshot. Anything unexpected leaves the backend untouched. */
function restore(backend: MemoryBackend, raw: string): boolean {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) return false;
  const snapshot = parsed as Record<string, unknown>;
  if (snapshot.v !== SNAPSHOT_VERSION) return false;
  for (const name of SNAPSHOT_MAPS) if (!Array.isArray(snapshot[name])) return false;
  for (const name of SNAPSHOT_MAPS) {
    const target = backend[name] as Map<string, unknown>;
    for (const entry of snapshot[name] as unknown[]) {
      if (Array.isArray(entry) && typeof entry[0] === 'string') target.set(entry[0], entry[1]);
    }
  }
  backend.session = (snapshot.session ?? null) as AuthSession | null;
  return true;
}

export function createMemoryBackend(options: MemoryBackendOptions = {}): MemoryBackend {
  const storage = options.storage ?? null;
  const debounceMs = options.saveDebounceMs ?? SAVE_DEBOUNCE_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastSaved: string | null = null;

  const backend: MemoryBackend = {
    now: options.now ?? (() => Date.now()),
    random: options.random ?? Math.random,
    newId: options.newId ?? (() => globalThis.crypto.randomUUID()),
    users: new Map(),
    session: null,
    listeners: new Set(),
    events: new Map(),
    states: new Map(),
    directors: new Map(),
    settings: new Map(),
    rooms: new Map(),
    members: new Map(),
    attempts: new Map(),
    touch: () => {
      if (storage === null || timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        save();
      }, debounceMs);
    },
    flush: () => {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
      save();
    },
  };

  function save(): void {
    if (storage === null) return;
    try {
      const text = serialize(backend);
      if (text === lastSaved) return;
      storage.setItem(MEMORY_STORAGE_KEY, text);
      lastSaved = text;
    } catch {
      // Storage full or blocked: the demo keeps working in memory.
    }
  }

  if (storage !== null) {
    try {
      const raw = storage.getItem(MEMORY_STORAGE_KEY);
      if (raw !== null && restore(backend, raw)) lastSaved = raw;
    } catch {
      // Corrupt or unreadable: start empty.
    }
    // The last 100 ms of work must not be lost when the tab goes away.
    if (typeof globalThis.addEventListener === 'function') {
      globalThis.addEventListener('pagehide', backend.flush);
    }
  }
  return backend;
}

/**
 * Wraps every method of a repository so the backend saves after the call settles (and before it
 * rejects): one place covers each mutation, including the ones that edit a stored record in place.
 */
export function withPersistence<T extends object>(backend: MemoryBackend, repo: T): T {
  const wrapped: Record<string, unknown> = {};
  for (const [name, member] of Object.entries(repo) as [string, unknown][]) {
    if (typeof member !== 'function') {
      wrapped[name] = member;
      continue;
    }
    wrapped[name] = (...args: unknown[]): unknown => {
      const result: unknown = (member as (...a: unknown[]) => unknown)(...args);
      if (result instanceof Promise) {
        return result.then(
          (value: unknown) => {
            backend.touch();
            return value;
          },
          (error: unknown) => {
            backend.touch();
            throw error;
          },
        );
      }
      backend.touch();
      return result;
    };
  }
  return wrapped as T;
}

/** Runs `fn` and returns its result as a promise, turning a throw into a rejection (async contract). */
export function attempt<T>(fn: () => T): Promise<T> {
  try {
    return Promise.resolve(fn());
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
}

export function memberKey(roomCode: string, userId: string): string {
  return `${roomCode}:${userId}`;
}

export function isoNow(backend: MemoryBackend): string {
  return new Date(backend.now()).toISOString();
}

/** The signed-in user id, or `not_authenticated` (what auth.uid() IS NULL means in SQL). */
export function requireUserId(backend: MemoryBackend): string {
  const id = backend.session?.user.id;
  if (id === undefined) throw new DataError('not_authenticated', 'Not signed in');
  return id;
}

/** JSON round trip: what a jsonb column does to a value (drops undefined, rejects cycles). */
export function toJson(value: unknown): unknown {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value)) as unknown;
}

export function purgeExpiredRooms(backend: MemoryBackend): number {
  const cutoff = backend.now() - ROOM_TTL_MS;
  let deleted = 0;
  for (const room of [...backend.rooms.values()]) {
    if (room.lastSeenAt < cutoff) {
      backend.rooms.delete(room.code);
      for (const key of [...backend.members.keys()]) {
        if (backend.members.get(key)?.roomCode === room.code) backend.members.delete(key);
      }
      deleted += 1;
    }
  }
  const attemptCutoff = backend.now() - 60 * 60 * 1000;
  for (const [user, times] of backend.attempts) {
    const kept = times.filter((t) => t > attemptCutoff);
    if (kept.length === 0) backend.attempts.delete(user);
    else backend.attempts.set(user, kept);
  }
  return deleted;
}

export function newRoomCode(backend: MemoryBackend): string {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = generateRoomCode(backend.random);
    if (!backend.rooms.has(code) && isValidRoomCode(code)) return code;
  }
  throw new DataError('unknown', 'Room code space exhausted');
}
