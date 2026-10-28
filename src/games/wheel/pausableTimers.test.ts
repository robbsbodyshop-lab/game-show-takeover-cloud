import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PausableTimers, realTimers } from './pausableTimers';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('PausableTimers', () => {
  it('fires once after its delay', () => {
    const t = new PausableTimers(realTimers);
    const fn = vi.fn();
    t.schedule('a', 1000, fn);
    vi.advanceTimersByTime(999);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(t.has('a')).toBe(false);
  });

  it('pauses with the time left and resumes from there', () => {
    const t = new PausableTimers(realTimers);
    const fn = vi.fn();
    t.schedule('a', 1000, fn);
    vi.advanceTimersByTime(400);
    t.pause();
    expect(t.remaining('a')).toBe(600);
    vi.advanceTimersByTime(60_000);
    expect(fn).not.toHaveBeenCalled();
    t.resume();
    vi.advanceTimersByTime(599);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('starts a timer scheduled while paused only on resume', () => {
    const t = new PausableTimers(realTimers);
    const fn = vi.fn();
    t.pause();
    t.schedule('a', 500, fn);
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
    expect(t.remaining('a')).toBe(500);
    t.resume();
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('replaces, cancels by id and by prefix, and reports totals', () => {
    const t = new PausableTimers(realTimers);
    const a = vi.fn();
    const b = vi.fn();
    t.schedule('x', 100, a);
    t.schedule('x', 300, b);
    expect(t.totalOf('x')).toBe(300);
    vi.advanceTimersByTime(300);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);

    const c = vi.fn();
    t.schedule('cue:1', 100, c);
    t.schedule('cue:2', 100, c);
    t.schedule('keep', 100, c);
    t.cancelPrefix('cue:');
    vi.advanceTimersByTime(100);
    expect(c).toHaveBeenCalledTimes(1);
    t.schedule('later', 100, c);
    t.cancelAll();
    vi.advanceTimersByTime(1000);
    expect(c).toHaveBeenCalledTimes(1);
    expect(t.remaining('nothing')).toBeNull();
  });

  it('lets a timer reschedule itself from inside its callback', () => {
    const t = new PausableTimers(realTimers);
    let n = 0;
    const tick = (): void => {
      n += 1;
      if (n < 3) t.schedule('loop', 100, tick);
    };
    t.schedule('loop', 100, tick);
    vi.advanceTimersByTime(1000);
    expect(n).toBe(3);
  });
});
