/**
 * Seeded PRNG for the capsule puzzle engine (docs/PUZZLE_GAME_MECHANICS.md section 3, "deterministic
 * port": one seedable generator, fixed call order). mulberry32: 32-bit state, so the whole generator
 * state fits in one JSON number and a replay from a seed is bit-identical.
 */

export interface StatefulRng {
  /** Next float in [0, 1). */
  next: () => number;
  /** Current 32-bit state; feed it back to `createStatefulRng` to resume the sequence. */
  getState: () => number;
}

/** Pure single step: returns the value and the successor state. */
export function nextRandom(state: number): { value: number; state: number } {
  const s = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: s >>> 0 };
}

export function createStatefulRng(state: number): StatefulRng {
  let current = state >>> 0;
  return {
    next: () => {
      const r = nextRandom(current);
      current = r.state;
      return r.value;
    },
    getState: () => current,
  };
}

/** Closure form: `createRng(seed)()` yields floats in [0, 1). */
export function createRng(seed: number): () => number {
  return createStatefulRng(seed).next;
}

/** Integer in [0, n). */
export function randomInt(rng: () => number, n: number): number {
  return Math.floor(rng() * n);
}
