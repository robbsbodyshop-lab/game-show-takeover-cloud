/**
 * A pausable countdown with an optional lead-in ("hold") and one warning threshold. It keeps its
 * state as remaining milliseconds, so pause/resume and a reload restore the exact time left.
 * Time and timers are injected so tests can drive it with fake timers.
 */

export interface ClockEnv {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export interface CountdownCallbacks {
  /** Called once when `warnAtMs` is left (not when the clock starts at or below it). */
  onWarn?: () => void;
  onExpire: () => void;
}

export interface CountdownView {
  /** Time left after the lead-in. */
  remainingMs: number;
  /** Lead-in (hold) still to elapse before the clock proper runs. */
  leadMs: number;
  running: boolean;
  /** The full length this clock was started with. */
  totalMs: number;
}

export class Countdown {
  private lead = 0;
  private remaining = 0;
  private total = 0;
  private active = false;
  private running = false;
  private since = 0;
  private warned = false;
  private timer: unknown = null;

  constructor(
    private readonly env: ClockEnv,
    private readonly callbacks: CountdownCallbacks,
    private readonly warnAtMs = 0,
  ) {}

  /** Arms the clock paused; call `resume()` to run it. */
  begin(totalMs: number, leadMs = 0): void {
    this.disarm();
    this.total = Math.max(0, totalMs);
    this.remaining = this.total;
    this.lead = Math.max(0, leadMs);
    this.active = true;
    this.warned = this.warnAtMs <= 0 || this.total <= this.warnAtMs;
  }

  /** Restores a saved clock (paused). */
  restore(view: Pick<CountdownView, 'remainingMs' | 'leadMs' | 'totalMs'>): void {
    this.begin(view.totalMs, view.leadMs);
    this.remaining = Math.max(0, Math.min(view.remainingMs, view.totalMs));
    this.warned = this.warnAtMs <= 0 || this.remaining <= this.warnAtMs;
  }

  isActive(): boolean {
    return this.active;
  }

  isRunning(): boolean {
    return this.active && this.running;
  }

  resume(): void {
    if (!this.active || this.running) return;
    this.running = true;
    this.since = this.env.now();
    this.arm();
  }

  pause(): void {
    if (!this.active || !this.running) return;
    this.settle();
    this.running = false;
    this.clearTimer();
  }

  cancel(): void {
    this.disarm();
  }

  /** Time left, computed live. */
  view(): CountdownView {
    let { lead, remaining } = this;
    if (this.active && this.running) {
      let elapsed = Math.max(0, this.env.now() - this.since);
      const take = Math.min(lead, elapsed);
      lead -= take;
      elapsed -= take;
      remaining = Math.max(0, remaining - elapsed);
    }
    return { remainingMs: remaining, leadMs: lead, running: this.isRunning(), totalMs: this.total };
  }

  // ------------------------------------------------------------------------------ internals

  private disarm(): void {
    this.clearTimer();
    this.active = false;
    this.running = false;
    this.lead = 0;
    this.remaining = 0;
  }

  private clearTimer(): void {
    if (this.timer !== null) this.env.clearTimeout(this.timer);
    this.timer = null;
  }

  /** Folds the time elapsed since `since` into lead and remaining. */
  private settle(): void {
    const now = this.env.now();
    let elapsed = Math.max(0, now - this.since);
    this.since = now;
    const take = Math.min(this.lead, elapsed);
    this.lead -= take;
    elapsed -= take;
    this.remaining = Math.max(0, this.remaining - elapsed);
  }

  private arm(): void {
    this.clearTimer();
    if (!this.active || !this.running) return;
    const toExpire = this.lead + this.remaining;
    const toWarn =
      !this.warned && this.remaining > this.warnAtMs ? this.lead + this.remaining - this.warnAtMs : Infinity;
    const due = Math.max(0, Math.min(toWarn, toExpire));
    this.timer = this.env.setTimeout(() => {
      this.timer = null;
      this.fire();
    }, due);
  }

  private fire(): void {
    if (!this.active || !this.running) return;
    this.settle();
    if (this.lead <= 0 && this.remaining <= 0) {
      this.disarm();
      this.callbacks.onExpire();
      return;
    }
    if (!this.warned && this.lead <= 0 && this.remaining <= this.warnAtMs) {
      this.warned = true;
      this.callbacks.onWarn?.();
    }
    this.arm();
  }
}
