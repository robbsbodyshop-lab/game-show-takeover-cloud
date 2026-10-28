import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryBackend,
  MEMORY_STORAGE_KEY,
  SAVE_DEBOUNCE_MS,
  type BackendStorage,
} from './memoryBackend';
import { createMemoryAuthService } from './MemoryAuthService';
import { createMemoryEventRepo } from './MemoryEventRepo';
import { createMemoryRoomRepo } from './MemoryRoomRepo';

function fakeStorage(initial: Record<string, string> = {}): BackendStorage & {
  data: Map<string, string>;
  writes: number;
} {
  const data = new Map(Object.entries(initial));
  const store = {
    data,
    writes: 0,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.writes += 1;
      data.set(key, value);
    },
  };
  return store;
}

function build(storage: BackendStorage | null) {
  let n = 0;
  const backend = createMemoryBackend({ storage, random: () => 0.5, newId: () => `id-${String(++n)}` });
  return {
    backend,
    auth: createMemoryAuthService(backend),
    events: createMemoryEventRepo(backend),
    rooms: createMemoryRoomRepo(backend),
  };
}

describe('memory backend persistence (FR-005 in demo mode)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves the whole state under one key, debounced, and a new backend loads it', async () => {
    const storage = fakeStorage();
    const first = build(storage);
    await first.auth.signUp('a@example.com', 'correct horse');
    const event = await first.events.createEvent('Reload me');
    await first.events.saveState(event.id, { phase: 'feud' }, 0);
    const code = await first.rooms.openRoom(event.id);

    expect(storage.writes).toBe(0);
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(storage.writes).toBe(1);
    expect([...storage.data.keys()]).toEqual([MEMORY_STORAGE_KEY]);

    const second = build(storage);
    expect(await second.auth.getSession()).toMatchObject({ user: { email: 'a@example.com' } });
    expect((await second.events.listEvents()).map((e) => e.name)).toEqual(['Reload me']);
    expect(await second.events.loadState(event.id)).toMatchObject({ rev: 1, state: { phase: 'feud' } });
    expect(await second.rooms.openRoom(event.id)).toBe(code);
  });

  it('skips the write when nothing changed', async () => {
    const storage = fakeStorage();
    const one = build(storage);
    await one.auth.signUp('a@example.com', 'correct horse');
    const event = await one.events.createEvent('Rooms');
    await one.rooms.openRoom(event.id);
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    const before = storage.writes;

    await one.events.listEvents();
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(storage.writes).toBe(before);
  });

  it('coalesces a burst of mutations into one write', async () => {
    const storage = fakeStorage();
    const { auth, events } = build(storage);
    await auth.signUp('a@example.com', 'correct horse');
    await events.createEvent('One');
    await events.createEvent('Two');
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(storage.writes).toBe(1);
  });

  it('flush() writes a pending save immediately', async () => {
    const storage = fakeStorage();
    const { backend, auth } = build(storage);
    await auth.signUp('a@example.com', 'correct horse');
    backend.flush();
    expect(storage.writes).toBe(1);
  });

  it('starts empty on corrupt or foreign data instead of throwing', async () => {
    for (const raw of ['not json', '{"v":99}', '[]', 'null', '{"v":1,"users":3}']) {
      const { events, auth } = build(fakeStorage({ [MEMORY_STORAGE_KEY]: raw }));
      expect(await auth.getSession()).toBeNull();
      await auth.signUp('a@example.com', 'correct horse');
      expect(await events.listEvents()).toEqual([]);
    }
  });

  it('keeps working when the storage throws', async () => {
    const throwing: BackendStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    const { auth, events } = build(throwing);
    await auth.signUp('a@example.com', 'correct horse');
    await events.createEvent('Still works');
    expect(() => vi.advanceTimersByTime(SAVE_DEBOUNCE_MS)).not.toThrow();
    expect(await events.listEvents()).toHaveLength(1);
  });

  it('stays purely in memory without a storage', async () => {
    const { auth, events } = build(null);
    await auth.signUp('a@example.com', 'correct horse');
    await events.createEvent('Volatile');
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(build(null).backend.events.size).toBe(0);
  });
});
