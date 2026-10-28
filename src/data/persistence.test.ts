import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cacheKey,
  createPersistence,
  loadCached,
  type CacheStorage,
  type PersistenceRepo,
} from './persistence';
import type { EventStateRecord, SaveStateResult } from './types';

interface SaveCall {
  id: string;
  state: unknown;
  expectedRev: number;
}

interface FakeRepo extends PersistenceRepo {
  saves: SaveCall[];
  /** Resolves each save with the next queued result (default: ok with expectedRev + 1). */
  results: (SaveStateResult | Error)[];
  stored: EventStateRecord | null;
  /** When set, saveState waits for this promise before answering. */
  gate: Promise<void> | null;
}

function createFakeRepo(): FakeRepo {
  const repo: FakeRepo = {
    saves: [],
    results: [],
    stored: null,
    gate: null,
    loadState: () => Promise.resolve(repo.stored),
    async saveState(id, state, expectedRev) {
      repo.saves.push({ id, state, expectedRev });
      if (repo.gate) await repo.gate;
      const next = repo.results.shift();
      if (next instanceof Error) throw next;
      return next ?? { ok: true, rev: expectedRev + 1 };
    },
  };
  return repo;
}

function createFakeStorage(failWrites = false): CacheStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      if (failWrites) throw new Error('QuotaExceededError');
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('createPersistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    setVisibility('visible');
  });

  it('debounces: only the newest state is written, 500 ms after the last save', async () => {
    const repo = createFakeRepo();
    const p = createPersistence(repo, 'ev1', { storage: null });
    p.save({ n: 1 });
    await vi.advanceTimersByTimeAsync(300);
    p.save({ n: 2 });
    await vi.advanceTimersByTimeAsync(300);
    p.save({ n: 3 });
    await vi.advanceTimersByTimeAsync(499);
    expect(repo.saves).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(repo.saves).toEqual([{ id: 'ev1', state: { n: 3 }, expectedRev: 0 }]);
    p.dispose();
  });

  it('tracks the revision between saves', async () => {
    const repo = createFakeRepo();
    const saved: number[] = [];
    const p = createPersistence(repo, 'ev1', { storage: null, onSaved: (rev) => saved.push(rev) });
    p.save('a');
    await vi.advanceTimersByTimeAsync(500);
    p.save('b');
    await vi.advanceTimersByTimeAsync(500);
    expect(repo.saves.map((s) => s.expectedRev)).toEqual([0, 1]);
    expect(saved).toEqual([1, 2]);
    expect(p.getRev()).toBe(2);
    p.dispose();
  });

  it('starts from initialRev and adopts the cloud rev on load()', async () => {
    const repo = createFakeRepo();
    repo.stored = { eventId: 'ev1', rev: 7, state: { x: 1 }, savedAt: '2026-10-28T00:00:00Z' };
    const p = createPersistence(repo, 'ev1', { storage: null, initialRev: 3 });
    expect(p.getRev()).toBe(3);
    expect(await p.load()).toEqual(repo.stored);
    expect(p.getRev()).toBe(7);
    p.save('a');
    await p.flush();
    expect(repo.saves[0]?.expectedRev).toBe(7);
    p.dispose();
  });

  it('flush() writes immediately and cancels the pending timer', async () => {
    const repo = createFakeRepo();
    const p = createPersistence(repo, 'ev1', { storage: null });
    p.save('now');
    await p.flush();
    expect(repo.saves).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(repo.saves).toHaveLength(1);
    await p.flush(); // nothing pending: no extra write
    expect(repo.saves).toHaveLength(1);
    p.dispose();
  });

  it('flushes when the page becomes hidden, not when it becomes visible', async () => {
    const repo = createFakeRepo();
    const p = createPersistence(repo, 'ev1', { storage: null });
    p.save('x');
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(repo.saves).toHaveLength(0);

    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(0);
    expect(repo.saves).toEqual([{ id: 'ev1', state: 'x', expectedRev: 0 }]);
    p.dispose();
  });

  it('flushes on pagehide', async () => {
    const repo = createFakeRepo();
    const p = createPersistence(repo, 'ev1', { storage: null });
    p.save('bye');
    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);
    expect(repo.saves).toHaveLength(1);
    p.dispose();
  });

  it('serialises writes: a save made while one is in flight uses the new rev', async () => {
    const repo = createFakeRepo();
    let release: () => void = () => undefined;
    repo.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const p = createPersistence(repo, 'ev1', { storage: null });
    p.save('first');
    await vi.advanceTimersByTimeAsync(500);
    expect(repo.saves).toHaveLength(1);

    p.save('second');
    await vi.advanceTimersByTimeAsync(500);
    expect(repo.saves).toHaveLength(1); // still waiting for the first answer

    repo.gate = null;
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(repo.saves.map((s) => [s.state, s.expectedRev])).toEqual([
      ['first', 0],
      ['second', 1],
    ]);
    p.dispose();
  });

  describe('conflicts', () => {
    it('calls onConflict once, stops saving and stays stopped until load()', async () => {
      const repo = createFakeRepo();
      repo.results.push({ ok: false, reason: 'conflict' });
      let conflicts = 0;
      const p = createPersistence(repo, 'ev1', { storage: null, onConflict: () => (conflicts += 1) });
      p.save('mine');
      await vi.advanceTimersByTimeAsync(500);
      expect(conflicts).toBe(1);
      expect(p.hasConflict()).toBe(true);

      p.save('ignored');
      await vi.advanceTimersByTimeAsync(2000);
      await p.flush();
      expect(repo.saves).toHaveLength(1);
      expect(conflicts).toBe(1);

      repo.stored = { eventId: 'ev1', rev: 5, state: 'theirs', savedAt: '2026-10-28T00:00:00Z' };
      await p.load();
      expect(p.hasConflict()).toBe(false);
      p.save('retaken');
      await vi.advanceTimersByTimeAsync(500);
      expect(repo.saves[1]).toEqual({ id: 'ev1', state: 'retaken', expectedRev: 5 });
      p.dispose();
    });

    it('drops a newer pending state when the in-flight write conflicts', async () => {
      const repo = createFakeRepo();
      let release: () => void = () => undefined;
      repo.gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      repo.results.push({ ok: false, reason: 'conflict' });
      const p = createPersistence(repo, 'ev1', { storage: null });
      p.save('a');
      await vi.advanceTimersByTimeAsync(500);
      p.save('b');
      release();
      await vi.advanceTimersByTimeAsync(1000);
      expect(repo.saves).toHaveLength(1);
      expect(p.hasConflict()).toBe(true);
      p.dispose();
    });
  });

  describe('errors', () => {
    it('reports the error, keeps the newest state and retries with backoff', async () => {
      const repo = createFakeRepo();
      repo.results.push(new Error('offline'), new Error('offline'));
      const errors: unknown[] = [];
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const p = createPersistence(repo, 'ev1', { storage: null, onError: (e) => errors.push(e) });
      p.save('keep me');
      await vi.advanceTimersByTimeAsync(500);
      expect(repo.saves).toHaveLength(1);
      expect(errors).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(999);
      expect(repo.saves).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1); // 1 s backoff
      expect(repo.saves).toHaveLength(2);

      await vi.advanceTimersByTimeAsync(2000); // 2 s backoff, then success
      expect(repo.saves).toHaveLength(3);
      expect(repo.saves.every((s) => s.state === 'keep me' && s.expectedRev === 0)).toBe(true);
      expect(p.getRev()).toBe(1);
      warn.mockRestore();
      p.dispose();
    });

    it('gives up after maxRetries until the next save()', async () => {
      const repo = createFakeRepo();
      repo.results.push(...Array.from({ length: 10 }, () => new Error('down')));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const p = createPersistence(repo, 'ev1', { storage: null, maxRetries: 2 });
      p.save('x');
      await vi.advanceTimersByTimeAsync(60_000);
      expect(repo.saves).toHaveLength(3); // first try + 2 retries
      warn.mockRestore();
      p.dispose();
    });
  });

  describe('localStorage cache', () => {
    it('writes the state on save() and marks it synced after the cloud accepts it', async () => {
      const repo = createFakeRepo();
      const storage = createFakeStorage();
      const p = createPersistence(repo, 'ev1', { storage });
      p.save({ n: 1 });
      expect(loadCached('ev1', storage)).toMatchObject({ rev: 0, state: { n: 1 }, synced: false });
      expect(storage.map.has('gst:cache:ev1')).toBe(true);
      expect(cacheKey('ev1')).toBe('gst:cache:ev1');

      await vi.advanceTimersByTimeAsync(500);
      expect(loadCached('ev1', storage)).toMatchObject({ rev: 1, state: { n: 1 }, synced: true });
      p.dispose();
    });

    it('returns null for a missing, corrupt or unreadable cache', () => {
      const storage = createFakeStorage();
      expect(loadCached('nope', storage)).toBeNull();
      storage.map.set('gst:cache:bad', '{not json');
      expect(loadCached('bad', storage)).toBeNull();
      storage.map.set('gst:cache:shape', JSON.stringify({ rev: 'x' }));
      expect(loadCached('shape', storage)).toBeNull();
      expect(loadCached('any', null)).toBeNull();
      const throwing: CacheStorage = {
        getItem: () => {
          throw new Error('SecurityError');
        },
        setItem: () => undefined,
        removeItem: () => undefined,
      };
      expect(loadCached('any', throwing)).toBeNull();
    });

    it('keeps saving to the cloud when the cache cannot be written', async () => {
      const repo = createFakeRepo();
      const p = createPersistence(repo, 'ev1', { storage: createFakeStorage(true) });
      p.save('x');
      await vi.advanceTimersByTimeAsync(500);
      expect(repo.saves).toHaveLength(1);
      p.dispose();
    });
  });

  it('dispose() flushes pending state and stops reacting to the page', async () => {
    const repo = createFakeRepo();
    const p = createPersistence(repo, 'ev1', { storage: null });
    p.save('last');
    p.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(repo.saves).toEqual([{ id: 'ev1', state: 'last', expectedRev: 0 }]);

    p.save('after dispose');
    setVisibility('hidden');
    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(repo.saves).toHaveLength(1);
  });
});
