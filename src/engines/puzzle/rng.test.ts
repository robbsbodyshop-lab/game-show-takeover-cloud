import { describe, expect, it } from 'vitest';
import { createRng, createStatefulRng, nextRandom, randomInt } from './rng';

describe('seeded rng', () => {
  it('replays bit-identically from the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const xs = Array.from({ length: 200 }, () => a());
    const ys = Array.from({ length: 200 }, () => b());
    expect(xs).toEqual(ys);
  });

  it('differs between seeds and stays in [0, 1)', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a()).not.toBe(b());
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('resumes from a serialized state', () => {
    const a = createStatefulRng(99);
    a.next();
    a.next();
    const resumed = createStatefulRng(a.getState());
    expect(resumed.next()).toBe(a.next());
    const step = nextRandom(5);
    expect(nextRandom(5)).toEqual(step);
  });

  it('randomInt covers the range', () => {
    const r = createRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(randomInt(r, 3));
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });
});
