/**
 * Timers that can all be frozen and resumed with their remaining time (FR-015: pause holds every
 * clock). The controller owns one instance; the underlying `setTimeout` is injected so tests drive it
 * with fake timers.
 */
export interface TimerEnv {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

/** Resolves the globals at call time so fake timers installed later are honoured. */
export const realTimers: TimerEnv = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => {
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
  now: () => Date.now(),
};

interface Entry {
  fn: () => void;
  /** Milliseconds left when the entry was last (re)started. */
  remaining: number;
  /** Env time it was last (re)started; null while paused. */
  startedAt: number | null;
  handle: unknown;
  total: number;
}

export class PausableTimers {
  private readonly entries = new Map<string, Entry>();
  private isPaused = false;

  constructor(private readonly env: TimerEnv) {}

  get paused(): boolean {
    return this.isPaused;
  }

  /** Starts (or replaces) the timer `id`. While paused it is stored and starts on resume. */
  schedule(id: string, ms: number, fn: () => void): void {
    this.cancel(id);
    const entry: Entry = {
      fn,
      remaining: Math.max(0, ms),
      startedAt: null,
      handle: null,
      total: Math.max(0, ms),
    };
    this.entries.set(id, entry);
    if (!this.isPaused) this.start(id, entry);
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  cancel(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    if (entry.handle !== null) this.env.clearTimeout(entry.handle);
    this.entries.delete(id);
  }

  cancelPrefix(prefix: string): void {
    for (const id of [...this.entries.keys()]) if (id.startsWith(prefix)) this.cancel(id);
  }

  cancelAll(): void {
    for (const id of [...this.entries.keys()]) this.cancel(id);
  }

  /** Milliseconds left on `id`, or null when it is not scheduled. */
  remaining(id: string): number | null {
    const entry = this.entries.get(id);
    if (!entry) return null;
    if (entry.startedAt === null) return entry.remaining;
    return Math.max(0, entry.remaining - (this.env.now() - entry.startedAt));
  }

  totalOf(id: string): number | null {
    return this.entries.get(id)?.total ?? null;
  }

  pause(): void {
    if (this.isPaused) return;
    this.isPaused = true;
    const now = this.env.now();
    for (const entry of this.entries.values()) {
      if (entry.handle !== null) this.env.clearTimeout(entry.handle);
      entry.handle = null;
      if (entry.startedAt !== null) {
        entry.remaining = Math.max(0, entry.remaining - (now - entry.startedAt));
        entry.startedAt = null;
      }
    }
  }

  resume(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    for (const [id, entry] of [...this.entries]) this.start(id, entry);
  }

  private start(id: string, entry: Entry): void {
    entry.startedAt = this.env.now();
    entry.handle = this.env.setTimeout(() => {
      // Only a still-current entry may fire (a cancel or replace in between wins).
      if (this.entries.get(id) !== entry) return;
      this.entries.delete(id);
      entry.fn();
    }, entry.remaining);
  }
}
