import { DataError } from '../../errors';
import { generateRoomCode, isValidRoomCode } from '../../roomCode';
import type { AuthSession, AuthUser, EventRecord, EventStateRecord, HostSettingsRecord } from '../../types';

/**
 * Shared in-memory "database" for demo mode and tests. It mirrors the rules of 0001_init.sql
 * (ownership, rev compare-and-set, room codes, 12 h expiry, 5 failures / 10 min join limit) so a
 * contract test run against it means the same thing as one run against Supabase.
 * State lives in one JS context: another browser tab gets its own, empty backend.
 */

export const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
export const JOIN_WINDOW_MS = 10 * 60 * 1000;
export const JOIN_MAX_FAILURES = 5;

export interface MemoryBackendOptions {
  now?: () => number;
  random?: () => number;
  newId?: () => string;
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
  settings: Map<string, HostSettingsRecord>;
  rooms: Map<string, MemoryRoom>;
  members: Map<string, MemoryMember>;
  attempts: Map<string, number[]>;
}

export function createMemoryBackend(options: MemoryBackendOptions = {}): MemoryBackend {
  return {
    now: options.now ?? (() => Date.now()),
    random: options.random ?? Math.random,
    newId: options.newId ?? (() => globalThis.crypto.randomUUID()),
    users: new Map(),
    session: null,
    listeners: new Set(),
    events: new Map(),
    states: new Map(),
    settings: new Map(),
    rooms: new Map(),
    members: new Map(),
    attempts: new Map(),
  };
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
