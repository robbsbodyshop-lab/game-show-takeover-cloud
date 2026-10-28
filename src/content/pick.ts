/** Small helpers shared by the pickers. All randomness comes from an injected `Rng`. */
import type { Rng, UsedIds } from './types.ts';

export const toSet = (ids: UsedIds): ReadonlySet<string> => (ids instanceof Set ? ids : new Set(ids));

/** A random element, or undefined for an empty list. */
export const pickOne = <T>(list: readonly T[], rng: Rng): T | undefined => {
  if (list.length === 0) return undefined;
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
};

/** Fisher-Yates on a copy. */
export const shuffled = <T>(list: readonly T[], rng: Rng): T[] => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
};

/**
 * Walk the tiers in order and pick randomly from the first non-empty one.
 * Each tier is a pool; later tiers are the "pool ran dry" fallbacks.
 */
export const pickFromTiers = <T>(tiers: readonly (readonly T[])[], rng: Rng): T | undefined => {
  for (const tier of tiers) {
    const choice = pickOne(tier, rng);
    if (choice !== undefined) return choice;
  }
  return undefined;
};
