import { describe, expect, it } from 'vitest';
import { listTripleSets } from '@/content';
import { seededRng } from '@/content/testUtils';
import { autoplay, newGame } from '@/engines/wheel/testKit';
import type { WheelState } from '@/engines/wheel/types';
import { createWheelState, wheelReduce } from '@/engines/wheel/wheelEngine';
import { providePuzzles } from './puzzleProvider';

const ctx = (seed = 1, used: string[] = []) => ({ used: new Set(used), rng: seededRng(seed) });

/** A state that is asking for `request`, found by playing the fixture game forward. */
function asking(settings: Parameters<typeof newGame>[0], until: (s: WheelState) => boolean): WheelState {
  const s = autoplay(newGame(settings), until);
  expect(until(s)).toBe(true);
  return s;
}

describe('providePuzzles: the first request of each segment', () => {
  it('two toss-ups for a classic opening', () => {
    const s = createWheelState({
      teams: [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ],
    });
    const out = providePuzzles(s, s.request!, ctx());
    expect(out).toHaveLength(2);
    expect(new Set(out.map((p) => p.id)).size).toBe(2);
    expect(out.every((p) => p.use.includes('tossup'))).toBe(true);
  });

  it('ten toss-ups from ONE category for Fortune Frenzy', () => {
    const s = createWheelState({
      teams: [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ],
      settings: { opening: 'frenzy' },
    });
    const out = providePuzzles(s, s.request!, ctx());
    expect(out).toHaveLength(10);
    expect(new Set(out.map((p) => p.category)).size).toBe(1);
    expect(new Set(out.map((p) => p.id)).size).toBe(10);
  });

  it('a whole Triple Toss-Up set in file order, then a Prize Puzzle with its prize', () => {
    const triple = asking({}, (s) => s.stage === 'triple' && s.phase === 'awaiting-puzzles');
    const out = providePuzzles(triple, triple.request!, ctx());
    expect(out).toHaveLength(3);
    expect(new Set(out.map((p) => p.set)).size).toBe(1);
    expect(new Set(out.map((p) => p.category)).size).toBe(1);
    expect(out.map((p) => p.id)).toEqual([...out.map((p) => p.id)].sort());
    const sets = listTripleSets();
    expect(sets.find((x) => x.set === out[0]?.set)?.puzzles.map((p) => p.id)).toEqual(out.map((p) => p.id));

    const prize = asking({}, (s) => s.stage === 'round' && s.round === 3 && s.phase === 'awaiting-puzzles');
    const prizes = providePuzzles(prize, prize.request!, ctx());
    expect(prizes).toHaveLength(2);
    expect(prizes.every((p) => p.prize !== undefined && p.use.includes('prize'))).toBe(true);
  });

  it('three Bonus puzzles in three different categories', () => {
    const s = asking({ length: 'short' }, (st) => st.phase === 'round-award' && st.award?.speedUp === true);
    const bonus = {
      ...s,
      stage: 'bonus' as const,
      phase: 'awaiting-puzzles' as const,
      request: { use: 'bonus' as const, count: 3 },
      awaiting: 'start' as const,
    };
    const out = providePuzzles(bonus, bonus.request, ctx());
    expect(out).toHaveLength(3);
    expect(new Set(out.map((p) => p.category)).size).toBe(3);
    expect(out.every((p) => p.use.includes('bonus'))).toBe(true);
  });

  it('never repeats content the event already used, and is deterministic for a seed', () => {
    const s = createWheelState({
      teams: [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ],
    });
    const req = s.request!;
    const first = providePuzzles(s, req, ctx(4));
    const again = providePuzzles(s, req, ctx(4));
    expect(again.map((p) => p.id)).toEqual(first.map((p) => p.id));
    const next = providePuzzles(
      s,
      req,
      ctx(
        4,
        first.map((p) => p.id),
      ),
    );
    expect(next.some((p) => first.some((q) => q.id === p.id))).toBe(false);
  });
});

describe('providePuzzles: replacements', () => {
  it('a thrown-out round puzzle is replaced from the same pool and is never the thrown one', () => {
    const s = asking({}, (st) => st.stage === 'round' && st.round === 1 && st.phase === 'choose');
    const thrown = s.puzzle?.puzzle.id ?? '';
    const asked: WheelState = {
      ...s,
      phase: 'awaiting-puzzles',
      request: { use: 'round', count: 1 },
      awaiting: 'replace',
    };
    for (let seed = 1; seed < 30; seed++) {
      const [one] = providePuzzles(asked, asked.request!, ctx(seed));
      expect(one?.use).toContain('round');
      expect(one?.id).not.toBe(thrown);
    }
  });

  it('a Frenzy top-up stays in the Frenzy category', () => {
    const real = createWheelState({
      teams: [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ],
      settings: { opening: 'frenzy' },
    });
    const first = providePuzzles(real, real.request!, ctx());
    const category = first[0]?.category;
    const started = wheelReduce(real, { type: 'PROVIDE_PUZZLES', puzzles: first });
    const asked: WheelState = {
      ...started,
      phase: 'awaiting-puzzles',
      request: { use: 'tossup', count: 4, ...(category ? { category } : {}) },
      awaiting: 'replace',
    };
    const topUp = providePuzzles(
      asked,
      asked.request!,
      ctx(
        2,
        first.map((p) => p.id),
      ),
    );
    expect(topUp).toHaveLength(4);
    expect(topUp.every((p) => p.category === category)).toBe(true);
    // A category holds 10 toss-ups and all 10 were dealt, so a top-up past them reuses (pool ran dry).
  });

  it('a Triple Toss-Up replacement keeps the set category', () => {
    const triple = asking({}, (s) => s.stage === 'triple' && s.phase === 'awaiting-puzzles');
    const set = providePuzzles(triple, triple.request!, ctx(3));
    const started = wheelReduce(triple, { type: 'PROVIDE_PUZZLES', puzzles: set });
    const asked: WheelState = {
      ...started,
      phase: 'awaiting-puzzles',
      request: {
        use: 'triple',
        count: 1,
        category: set[0]?.category ?? '',
        ...(set[0]?.set ? { set: set[0].set } : {}),
      },
      awaiting: 'replace',
    };
    const [spare] = providePuzzles(
      asked,
      asked.request!,
      ctx(
        3,
        set.map((p) => p.id),
      ),
    );
    expect(spare).toBeDefined();
    expect(spare?.category).toBe(set[0]?.category);
    expect(set.some((p) => p.id === spare?.id)).toBe(false);
  });
});
