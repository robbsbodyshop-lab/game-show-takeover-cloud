/**
 * Answers the engine's puzzle `request` from the content pickers (FR-040, design.md 8.2). The engine
 * never imports content; it asks, and this module returns playable `PuzzleInput`s. Randomness is
 * injected; replacements keep the pool, the Frenzy category and the Triple Toss-Up set.
 */
import {
  listTripleSets,
  pickBonusCategories,
  pickBonusReplacement,
  pickFrenzyCategory,
  pickPuzzle,
  pickReplacementPuzzle,
  pickTripleReplacement,
  pickTripleSet,
} from '@/content';
import type { Rng, WheelPickUse, WheelPuzzle } from '@/content';
import type { PuzzleInput, PuzzleRequest, WheelState } from '@/engines/wheel/types';

export interface ProviderContext {
  /** Everything already played this event plus everything already handed to this game. */
  used: ReadonlySet<string>;
  rng: Rng;
  /** Content to draw from; defaults to the bundled file. */
  puzzles?: readonly WheelPuzzle[];
}

const pickOpts = (puzzles: readonly WheelPuzzle[] | undefined) => (puzzles ? { puzzles } : {});

/** Several distinct puzzles from one pool. */
function pickMany(
  use: WheelPickUse,
  count: number,
  ctx: ProviderContext,
  category?: WheelPuzzle['category'],
): WheelPuzzle[] {
  const out: WheelPuzzle[] = [];
  for (let i = 0; i < count; i++) {
    const next = pickPuzzle(use, ctx.used, ctx.rng, {
      ...pickOpts(ctx.puzzles),
      ...(category === undefined ? {} : { category }),
      excludeIds: out.map((p) => p.id),
    });
    if (next) out.push(next);
  }
  return out;
}

const asCategory = (value: string | null | undefined): WheelPuzzle['category'] | undefined =>
  value === null || value === undefined ? undefined : (value as WheelPuzzle['category']);

function toInput(p: WheelPuzzle): PuzzleInput {
  return {
    id: p.id,
    category: p.category,
    phrase: p.phrase,
    use: [...p.use],
    ...(p.lines ? { lines: [...p.lines] } : {}),
    ...(p.prize ? { prize: { ...p.prize } } : {}),
    ...(p.sameLetter ? { sameLetter: p.sameLetter } : {}),
    ...(p.set ? { set: p.set } : {}),
    ...(p.theme ? { theme: p.theme } : {}),
  };
}

/** The puzzles that satisfy `request` for the state the engine is in; may be empty if content ran out. */
export function providePuzzles(
  state: WheelState,
  request: PuzzleRequest,
  ctx: ProviderContext,
): PuzzleInput[] {
  const replacing = state.awaiting === 'replace';
  const thrown = state.puzzle?.puzzle.id;
  switch (request.use) {
    case 'tossup': {
      if (state.stage === 'frenzy') {
        const category =
          asCategory(request.category) ??
          asCategory(state.frenzy?.category) ??
          pickFrenzyCategory(ctx.used, ctx.rng, ctx.puzzles);
        const exclude = thrown === undefined ? ctx.used : new Set([...ctx.used, thrown]);
        return pickMany('tossup', request.count, { ...ctx, used: exclude }, category).map(toInput);
      }
      if (replacing && thrown !== undefined) {
        const one = pickReplacementPuzzle('tossup', thrown, ctx.used, ctx.rng, pickOpts(ctx.puzzles));
        return one ? [toInput(one)] : [];
      }
      return pickMany('tossup', request.count, ctx).map(toInput);
    }
    case 'triple': {
      const setId = request.set ?? state.puzzle?.puzzle.set;
      if (replacing || request.count === 1) {
        const set = listTripleSets(ctx.puzzles).find((s) => s.set === setId);
        if (set) {
          const spare = pickTripleReplacement(set, ctx.used, ctx.rng, {
            ...pickOpts(ctx.puzzles),
            excludeIds: thrown === undefined ? [] : [thrown],
          });
          if (spare) return [toInput(spare)];
        }
        return [];
      }
      const set = pickTripleSet(ctx.used, ctx.rng, pickOpts(ctx.puzzles));
      return set ? set.puzzles.map(toInput) : [];
    }
    case 'bonus': {
      if (replacing) {
        const category = asCategory(request.category) ?? asCategory(state.bonus?.category);
        const offered = (state.bonus?.options ?? []).map((p) => p.id);
        if (category === undefined) return [];
        const one = pickBonusReplacement(category, ctx.used, ctx.rng, {
          offeredIds: [...offered, ...(thrown === undefined ? [] : [thrown])],
          ...pickOpts(ctx.puzzles),
        });
        return one ? [toInput(one)] : [];
      }
      const picked: WheelPuzzle[] = [];
      for (const category of pickBonusCategories(ctx.used, ctx.rng, ctx.puzzles)) {
        const one = pickPuzzle('bonus', ctx.used, ctx.rng, {
          ...pickOpts(ctx.puzzles),
          category,
          excludeIds: picked.map((p) => p.id),
        });
        if (one) picked.push(one);
      }
      return picked.slice(0, request.count).map(toInput);
    }
    default: {
      // round, prize, tiebreak
      const use: WheelPickUse = request.use;
      if (replacing && thrown !== undefined) {
        const one = pickReplacementPuzzle(use, thrown, ctx.used, ctx.rng, pickOpts(ctx.puzzles));
        return one ? [toInput(one)] : [];
      }
      return pickMany(use, request.count, ctx).map(toInput);
    }
  }
}
