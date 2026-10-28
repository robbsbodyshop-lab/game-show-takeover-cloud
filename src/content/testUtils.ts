/** Helpers for content tests: a seeded rng and small fixture builders. Not imported by app code. */
import type { Rng } from './types.ts';

/** mulberry32: a tiny deterministic generator, good enough for tests. */
export const seededRng = (seed: number): Rng => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
