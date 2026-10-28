/**
 * Wheel of Fortune content pickers (docs/reference/CONTENT_SCHEMA_V1.md). Every picker prefers content
 * not in `usedIds` and reuses only when its pool has run dry, so a long event never gets stuck.
 */
import { getWheelContent } from './data.ts';
import { pickFromTiers, shuffled, toSet } from './pick.ts';
import { MIN_TOSSUPS_PER_CATEGORY } from './schema.ts';
import type { Rng, TripleSet, UsedIds, WheelPickUse, WheelPuzzle } from './types.ts';

const allPuzzles = (): readonly WheelPuzzle[] => getWheelContent().puzzles;

export interface PickPuzzleOptions {
  /** Only puzzles in this category (Frenzy top-ups, Bonus). */
  category?: WheelPuzzle['category'];
  /** Never pick these (a thrown-out puzzle, the puzzles already on offer). */
  excludeIds?: UsedIds;
  /** Content to draw from; defaults to the bundled file. */
  puzzles?: readonly WheelPuzzle[];
}

/** Pick one puzzle for a pool: unused first, any only when every candidate has been used. */
export const pickPuzzle = (
  use: WheelPickUse,
  usedIds: UsedIds,
  rng: Rng,
  opts: PickPuzzleOptions = {},
): WheelPuzzle | undefined => {
  const used = toSet(usedIds);
  const excluded = toSet(opts.excludeIds ?? []);
  const pool = (opts.puzzles ?? allPuzzles()).filter(
    (p) =>
      p.use.includes(use) &&
      (opts.category === undefined || p.category === opts.category) &&
      !excluded.has(p.id),
  );
  return pickFromTiers([pool.filter((p) => !used.has(p.id)), pool], rng);
};

/**
 * Replace a puzzle the host threw out, from the same pool. In a main round this is the puzzle the Wheel
 * console shows under "Next puzzle".
 */
export const pickReplacementPuzzle = (
  use: WheelPickUse,
  thrownId: string,
  usedIds: UsedIds,
  rng: Rng,
  opts: PickPuzzleOptions = {},
): WheelPuzzle | undefined =>
  pickPuzzle(use, [...toSet(usedIds), thrownId], rng, {
    ...opts,
    excludeIds: [...toSet(opts.excludeIds ?? []), thrownId],
  });

/** The Triple Toss-Up sets in file order. */
export const listTripleSets = (puzzles: readonly WheelPuzzle[] = allPuzzles()): TripleSet[] => {
  const bySet = new Map<string, WheelPuzzle[]>();
  for (const p of puzzles) {
    if (!p.use.includes('triple') || !p.set) continue;
    bySet.set(p.set, [...(bySet.get(p.set) ?? []), p]);
  }
  const sets: TripleSet[] = [];
  for (const [set, members] of bySet) {
    const [a, b, c] = members;
    if (a && b && c && members.length === 3) {
      sets.push({ set, theme: a.theme ?? '', category: a.category, puzzles: [a, b, c] });
    }
  }
  return sets;
};

/** A whole Triple Toss-Up set no puzzle of which has been used, else the set with the fewest used. */
export const pickTripleSet = (
  usedIds: UsedIds,
  rng: Rng,
  opts: { excludeSets?: UsedIds; puzzles?: readonly WheelPuzzle[] } = {},
): TripleSet | undefined => {
  const used = toSet(usedIds);
  const excluded = toSet(opts.excludeSets ?? []);
  const sets = listTripleSets(opts.puzzles).filter((s) => !excluded.has(s.set));
  const usedCount = (s: TripleSet): number => s.puzzles.filter((p) => used.has(p.id)).length;
  const least = Math.min(...sets.map(usedCount));
  return pickFromTiers(
    [sets.filter((s) => usedCount(s) === 0), sets.filter((s) => usedCount(s) === least)],
    rng,
  );
};

/**
 * Replace a thrown-out Triple Toss-Up puzzle, keeping the set's category: a spare carrying the set id
 * first (a non-triple puzzle with the same `set`), then a toss-up, then any other short puzzle.
 */
export const pickTripleReplacement = (
  set: TripleSet,
  usedIds: UsedIds,
  rng: Rng,
  opts: { excludeIds?: UsedIds; puzzles?: readonly WheelPuzzle[] } = {},
): WheelPuzzle | undefined => {
  const used = toSet(usedIds);
  const excluded = toSet([...(opts.excludeIds ?? []), ...set.puzzles.map((p) => p.id)]);
  const inCategory = (opts.puzzles ?? allPuzzles()).filter(
    (p) => p.category === set.category && !excluded.has(p.id) && !p.use.includes('triple'),
  );
  const spares = inCategory.filter((p) => p.set === set.set);
  const tossups = inCategory.filter((p) => p.use.includes('tossup') && p.set !== set.set);
  // Other puzzles only if they fit the two middle rows; prize puzzles carry a prize and are never borrowed.
  const others = inCategory.filter(
    (p) =>
      !p.use.includes('tossup') &&
      !p.use.includes('prize') &&
      p.set !== set.set &&
      (p.lines?.length ?? 1) <= 2,
  );
  const fresh = (list: readonly WheelPuzzle[]): WheelPuzzle[] => list.filter((p) => !used.has(p.id));
  return pickFromTiers([fresh(spares), fresh(tossups), fresh(others), spares, tossups, others], rng);
};

/** Toss-up categories in file order. */
const tossupCategories = (puzzles: readonly WheelPuzzle[]): WheelPuzzle['category'][] => [
  ...new Set(puzzles.filter((p) => p.use.includes('tossup')).map((p) => p.category)),
];

/**
 * Fortune Frenzy's opening category: random among those with at least 10 unused toss-ups (its first 6
 * plus 4 spares), else the one with the most unused.
 */
export const pickFrenzyCategory = (
  usedIds: UsedIds,
  rng: Rng,
  puzzles: readonly WheelPuzzle[] = allPuzzles(),
): WheelPuzzle['category'] | undefined => {
  const used = toSet(usedIds);
  const counts = tossupCategories(puzzles).map((category) => ({
    category,
    unused: puzzles.filter((p) => p.category === category && p.use.includes('tossup') && !used.has(p.id))
      .length,
  }));
  const eligible = counts.filter((c) => c.unused >= MIN_TOSSUPS_PER_CATEGORY);
  const most = Math.max(...counts.map((c) => c.unused));
  return pickFromTiers([eligible, counts.filter((c) => c.unused === most)], rng)?.category;
};

const BONUS_ANCHORS = ['THING', 'PHRASE'] as const;

/**
 * The three categories the Bonus Round offers, in random order. At least one is THING or PHRASE when the
 * data has one; categories with unused bonus puzzles come first.
 */
export const pickBonusCategories = (
  usedIds: UsedIds,
  rng: Rng,
  puzzles: readonly WheelPuzzle[] = allPuzzles(),
): WheelPuzzle['category'][] => {
  const used = toSet(usedIds);
  const bonus = puzzles.filter((p) => p.use.includes('bonus'));
  const categoriesOf = (list: readonly WheelPuzzle[]): WheelPuzzle['category'][] => [
    ...new Set(list.map((p) => p.category)),
  ];
  const freshCats = categoriesOf(bonus.filter((p) => !used.has(p.id)));
  const allCats = categoriesOf(bonus);

  const isAnchor = (c: string): boolean => (BONUS_ANCHORS as readonly string[]).includes(c);
  const anchor = pickFromTiers([freshCats.filter(isAnchor), allCats.filter(isAnchor)], rng);
  const picked: WheelPuzzle['category'][] = anchor ? [anchor] : [];
  for (const pool of [freshCats, allCats]) {
    for (const c of shuffled(pool, rng)) {
      if (picked.length < 3 && !picked.includes(c)) picked.push(c);
    }
  }
  return shuffled(picked, rng);
};

/** Another puzzle in the chosen category, else any Bonus puzzle, never one already on offer. */
export const pickBonusReplacement = (
  category: WheelPuzzle['category'],
  usedIds: UsedIds,
  rng: Rng,
  opts: { offeredIds?: UsedIds; puzzles?: readonly WheelPuzzle[] } = {},
): WheelPuzzle | undefined => {
  const used = toSet(usedIds);
  const offered = toSet(opts.offeredIds ?? []);
  const bonus = (opts.puzzles ?? allPuzzles()).filter((p) => p.use.includes('bonus') && !offered.has(p.id));
  const same = bonus.filter((p) => p.category === category);
  const fresh = (list: readonly WheelPuzzle[]): WheelPuzzle[] => list.filter((p) => !used.has(p.id));
  return pickFromTiers([fresh(same), fresh(bonus), same, bonus], rng);
};
