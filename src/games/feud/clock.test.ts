import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Countdown, type ClockEnv } from './clock';

const env: ClockEnv = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => {
    clearTimeout(id as ReturnType<typeof setTimeout>);
  },
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const make = (warnAt = 1000) => {
  const onWarn = vi.fn();
  const onExpire = vi.fn();
  return { clock: new Countdown(env, { onWarn, onExpire }, warnAt), onWarn, onExpire };
};

describe('Countdown', () => {
  it('warns once at the threshold and expires at zero', () => {
    const { clock, onWarn, onExpire } = make();
    clock.begin(5000);
    clock.resume();
    vi.advanceTimersByTime(3999);
    expect(onWarn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onWarn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(999);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(clock.isActive()).toBe(false);
  });

  it('does not run until resumed, and pausing keeps the time left', () => {
    const { clock, onExpire } = make();
    clock.begin(5000);
    vi.advanceTimersByTime(10_000);
    expect(onExpire).not.toHaveBeenCalled();
    clock.resume();
    vi.advanceTimersByTime(2000);
    clock.pause();
    expect(clock.view().remainingMs).toBe(3000);
    vi.advanceTimersByTime(10_000);
    expect(clock.view().remainingMs).toBe(3000);
    clock.resume();
    vi.advanceTimersByTime(3000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('holds first: the lead-in elapses before the clock proper', () => {
    const { clock, onExpire } = make();
    clock.begin(5000, 1200);
    clock.resume();
    vi.advanceTimersByTime(1200);
    expect(clock.view()).toMatchObject({ leadMs: 0, remainingMs: 5000 });
    vi.advanceTimersByTime(4999);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('does not warn again after a pause in the warning zone, and not at all when it starts inside it', () => {
    const { clock, onWarn } = make();
    clock.begin(5000);
    clock.resume();
    vi.advanceTimersByTime(4500);
    clock.pause();
    clock.resume();
    vi.advanceTimersByTime(500);
    expect(onWarn).toHaveBeenCalledTimes(1);

    const short = make();
    short.clock.begin(1000);
    short.clock.resume();
    vi.advanceTimersByTime(1000);
    expect(short.onWarn).not.toHaveBeenCalled();
    expect(short.onExpire).toHaveBeenCalledTimes(1);
  });

  it('restores a saved clock with its remaining time', () => {
    const { clock, onExpire } = make();
    clock.restore({ remainingMs: 2500, leadMs: 0, totalMs: 5000 });
    clock.resume();
    vi.advanceTimersByTime(2499);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('can be cancelled', () => {
    const { clock, onExpire } = make();
    clock.begin(1000);
    clock.resume();
    clock.cancel();
    vi.advanceTimersByTime(5000);
    expect(onExpire).not.toHaveBeenCalled();
    expect(clock.isActive()).toBe(false);
  });
});
