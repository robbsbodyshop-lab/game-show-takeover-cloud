import { describe, expect, it } from 'vitest';
import { getWheelContent } from './data.ts';
import {
  listTripleSets,
  pickBonusCategories,
  pickBonusReplacement,
  pickFrenzyCategory,
  pickPuzzle,
  pickReplacementPuzzle,
  pickTripleReplacement,
  pickTripleSet,
} from './wheelPicker.ts';
import { seededRng } from './testUtils.ts';
import type { WheelPickUse, WheelPuzzle } from './types.ts';

const { puzzles } = getWheelContent();
const ofUse = (use: string): WheelPuzzle[] => puzzles.filter((p) => p.use.includes(use as never));
const tossupCategories = [...new Set(ofUse('tossup').map((p) => p.category))];

const mk = (id: string, category: string, use: string[], extra: Partial<WheelPuzzle> = {}): WheelPuzzle =>
  ({ id, category, phrase: id.toUpperCase(), use, ...extra }) as WheelPuzzle;

describe('pickPuzzle', () => {
  it.each(['round', 'tossup', 'prize', 'tiebreak', 'bonus'] as WheelPickUse[])(
    '%s draws from its own pool',
    (use) => {
      const rng = seededRng(1);
      for (let i = 0; i < 40; i++) expect(pickPuzzle(use, [], rng)?.use).toContain(use);
    },
  );

  it('never repeats while the pool has fresh puzzles', () => {
    const rng = seededRng(2);
    const used = new Set<string>();
    for (const prize of ofUse('prize')) {
      const p = pickPuzzle('prize', used, rng);
      expect(p && used.has(p.id)).toBe(false);
      expect(prize.use).toContain('prize');
      used.add(p?.id ?? '');
    }
    // Pool dry: reuse rather than stall.
    expect(pickPuzzle('prize', used, rng)).toBeDefined();
  });

  it('honours category and excludeIds', () => {
    const rng = seededRng(3);
    const p = pickPuzzle('tossup', [], rng, { category: 'PLACE' });
    expect(p?.category).toBe('PLACE');
    const only = ofUse('tossup').filter((q) => q.category === 'PLACE');
    const left = only.slice(1).map((q) => q.id);
    expect(pickPuzzle('tossup', [], rng, { category: 'PLACE', excludeIds: left })?.id).toBe(only[0]?.id);
  });

  it('tiebreak pool is a subset of the toss-ups', () => {
    for (const p of ofUse('tiebreak')) expect(p.use).toContain('tossup');
  });

  it('is deterministic for a seed', () => {
    expect(pickPuzzle('round', [], seededRng(8))?.id).toBe(pickPuzzle('round', [], seededRng(8))?.id);
  });

  it('returns undefined when the pool is empty', () => {
    expect(pickPuzzle('prize', [], seededRng(1), { puzzles: [] })).toBeUndefined();
  });
});

describe('pickReplacementPuzzle', () => {
  it('replaces from the same pool and never returns the thrown puzzle', () => {
    const pool = [mk('a', 'THING', ['round']), mk('b', 'THING', ['round'])];
    for (let seed = 0; seed < 10; seed++) {
      expect(pickReplacementPuzzle('round', 'a', ['a'], seededRng(seed), { puzzles: pool })?.id).toBe('b');
    }
  });
});

describe('Triple Toss-Up sets', () => {
  it('lists 14 sets of 3 in file order', () => {
    const sets = listTripleSets();
    expect(sets).toHaveLength(14);
    for (const s of sets) {
      expect(s.puzzles.every((p) => p.category === s.category && p.theme === s.theme)).toBe(true);
      const idx = s.puzzles.map((p) => puzzles.indexOf(p));
      expect(idx).toEqual([...idx].sort((a, b) => a - b));
    }
  });

  it('plays each set once before repeating any', () => {
    const rng = seededRng(4);
    const used = new Set<string>();
    const seen = new Set<string>();
    for (let i = 0; i < 14; i++) {
      const s = pickTripleSet(used, rng);
      expect(s && seen.has(s.set)).toBe(false);
      seen.add(s?.set ?? '');
      s?.puzzles.forEach((p) => used.add(p.id));
    }
    expect(pickTripleSet(used, rng)).toBeDefined();
  });

  it('prefers the set with the fewest used when all are touched', () => {
    const sets = listTripleSets();
    const used = sets.flatMap((s, i) => (i === 3 ? [s.puzzles[0].id] : s.puzzles.map((p) => p.id)));
    expect(pickTripleSet(used, seededRng(1))?.set).toBe(sets[3]?.set);
  });

  describe('replacement', () => {
    const set = {
      set: 's1',
      theme: 'T',
      category: 'THING' as const,
      puzzles: [
        mk('t1', 'THING', ['triple']),
        mk('t2', 'THING', ['triple']),
        mk('t3', 'THING', ['triple']),
      ] as const,
    };
    it('uses a spare carrying the set id first', () => {
      const pool = [
        ...set.puzzles,
        mk('spare', 'THING', ['tossup'], { set: 's1' }),
        mk('tu', 'THING', ['tossup']),
        mk('elsewhere', 'PLACE', ['tossup']),
      ];
      for (let seed = 0; seed < 10; seed++) {
        expect(pickTripleReplacement(set, [], seededRng(seed), { puzzles: pool })?.id).toBe('spare');
      }
    });
    it('then a toss-up in the same category, else another short puzzle in it', () => {
      const pool = [
        ...set.puzzles,
        mk('tu', 'THING', ['tossup']),
        mk('r', 'THING', ['round']),
        mk('x', 'PLACE', ['tossup']),
      ];
      expect(pickTripleReplacement(set, [], seededRng(1), { puzzles: pool })?.id).toBe('tu');
      expect(pickTripleReplacement(set, ['tu'], seededRng(1), { puzzles: pool })?.id).toBe('r');
    });
    it('never returns a member of the set, and keeps the category (real data)', () => {
      for (const s of listTripleSets()) {
        const r = pickTripleReplacement(s, [], seededRng(6), { excludeIds: [s.puzzles[0].id] });
        expect(r?.category).toBe(s.category);
        expect(s.puzzles.map((p) => p.id)).not.toContain(r?.id);
        expect(r?.use).not.toContain('triple');
        expect(r?.use).not.toContain('prize');
        expect(r?.lines?.length ?? 1).toBeLessThanOrEqual(2);
      }
    });
  });
});

describe('pickFrenzyCategory', () => {
  it('opens in any of the seven toss-up categories on a fresh event', () => {
    expect(tossupCategories).toHaveLength(7);
    const seen = new Set<string>();
    for (let seed = 0; seed < 200; seed++) seen.add(pickFrenzyCategory([], seededRng(seed)) ?? '');
    expect(seen).toEqual(new Set(tossupCategories));
  });

  it('skips a category with fewer than 10 unused toss-ups', () => {
    const used = ofUse('tossup')
      .filter((p) => p.category === 'PLACE')
      .slice(0, 1)
      .map((p) => p.id);
    for (let seed = 0; seed < 100; seed++)
      expect(pickFrenzyCategory(used, seededRng(seed))).not.toBe('PLACE');
  });

  it('falls back to the category with the most unused when none has 10', () => {
    const used: string[] = [];
    const keep = 'FUN & GAMES';
    for (const c of tossupCategories) {
      const list = ofUse('tossup').filter((p) => p.category === c);
      used.push(...list.slice(0, c === keep ? 1 : 3).map((p) => p.id));
    }
    for (let seed = 0; seed < 20; seed++) expect(pickFrenzyCategory(used, seededRng(seed))).toBe(keep);
  });
});

describe('pickBonusCategories', () => {
  it('offers three distinct bonus categories, always including THING or PHRASE', () => {
    for (let seed = 0; seed < 300; seed++) {
      const cats = pickBonusCategories([], seededRng(seed));
      expect(cats).toHaveLength(3);
      expect(new Set(cats).size).toBe(3);
      expect(cats.some((c) => c === 'THING' || c === 'PHRASE')).toBe(true);
      for (const c of cats) expect(ofUse('bonus').some((p) => p.category === c)).toBe(true);
    }
  });

  it('still includes an anchor when THING has no fresh puzzle left', () => {
    const used = ofUse('bonus')
      .filter((p) => p.category === 'THING')
      .map((p) => p.id);
    for (let seed = 0; seed < 100; seed++) {
      const cats = pickBonusCategories(used, seededRng(seed));
      expect(cats).toContain('PHRASE');
      expect(cats).not.toContain('THING');
    }
  });

  it('prefers categories that still have unused puzzles', () => {
    const exhausted = ofUse('bonus')
      .filter((p) => p.category === 'PERSON')
      .map((p) => p.id);
    for (let seed = 0; seed < 100; seed++)
      expect(pickBonusCategories(exhausted, seededRng(seed))).not.toContain('PERSON');
  });
});

describe('pickBonusReplacement', () => {
  it('picks within the category, then anywhere, never an offered puzzle', () => {
    const pool = [
      mk('t1', 'THING', ['bonus']),
      mk('t2', 'THING', ['bonus']),
      mk('p1', 'PLACE', ['bonus']),
      mk('p2', 'PLACE', ['bonus']),
    ];
    expect(pickBonusReplacement('THING', [], seededRng(1), { puzzles: pool, offeredIds: ['t1'] })?.id).toBe(
      't2',
    );
    expect(['p1', 'p2']).toContain(
      pickBonusReplacement('THING', [], seededRng(1), { puzzles: pool, offeredIds: ['t1', 't2'] })?.id,
    );
    expect(
      pickBonusReplacement('THING', ['t2'], seededRng(1), { puzzles: pool, offeredIds: ['t1'] })?.id,
    ).not.toBe('t1');
  });
});
