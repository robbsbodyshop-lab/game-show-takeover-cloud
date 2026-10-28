import { describe, expect, it } from 'vitest';
import {
  FRESH_SPECIALS,
  ROUND_LAYOUTS,
  TOP_DOLLAR,
  WEDGE_COUNT,
  buildWheel,
  drawForIndex,
  pegTicks,
  spinResult,
  spinRotation,
  wedgeValue,
} from './wheels';
import type { Wedge } from './wheels';
import type { RoundNo, WheelSpecials } from './types';

const count = (w: Wedge[], kind: Wedge['kind']): number => w.filter((x) => x.kind === kind).length;
const NONE: WheelSpecials = { wildCard: false, million: false, trip: false, mysteryFlipped: null };

describe('round wheels', () => {
  it.each([1, 2, 3, 4] as RoundNo[])('Round %i has 24 wedges, two Bankrupts and one Lose a Turn', (r) => {
    const w = buildWheel(r);
    expect(w).toHaveLength(WEDGE_COUNT);
    expect(WEDGE_COUNT).toBe(24);
    expect(count(w, 'bankrupt')).toBe(2);
    expect(count(w, 'lose-turn')).toBe(1);
  });

  it.each([1, 2, 3, 4] as RoundNo[])('Round %i has one top-dollar wedge and cash from $500 to $900', (r) => {
    const w = buildWheel(r);
    const tops = w.filter((x) => x.kind === 'cash' && x.top);
    expect(tops).toHaveLength(1);
    expect(tops[0]).toMatchObject({ value: { 1: 2500, 2: 3500, 3: 3500, 4: 5000 }[r] });
    expect(TOP_DOLLAR).toEqual({ 1: 2500, 2: 3500, 3: 3500, 4: 5000 });
    for (const x of w) {
      if (x.kind === 'cash' && !x.top) {
        expect(x.value).toBeGreaterThanOrEqual(500);
        expect(x.value).toBeLessThanOrEqual(900);
      }
    }
  });

  it('Round 1 carries the Wild Card, the Million Dollar Wedge and a trip wedge ($500 plus the trip)', () => {
    const w = buildWheel(1);
    expect(count(w, 'wild-card')).toBe(1);
    expect(count(w, 'million')).toBe(1);
    expect(count(w, 'trip')).toBe(1);
    expect(w.find((x) => x.kind === 'trip')).toMatchObject({ value: 500 });
    expect(count(w, 'mystery') + count(w, 'express')).toBe(0);
    expect(w.filter((x) => x.kind === 'cash')).toHaveLength(24 - 2 - 1 - 3);
  });

  it('Round 2 has two Mystery wedges ($1,000) and the trip while unclaimed', () => {
    const w = buildWheel(2);
    expect(w.filter((x) => x.kind === 'mystery')).toEqual([
      { kind: 'mystery', value: 1000 },
      { kind: 'mystery', value: 1000 },
    ]);
    expect(count(w, 'trip')).toBe(1);
    expect(count(w, 'express')).toBe(0);
  });

  it('Round 2 has no trip wedge once the trip is claimed (the slot becomes $500)', () => {
    const w = buildWheel(2, { ...FRESH_SPECIALS, trip: false });
    expect(count(w, 'trip')).toBe(0);
    expect(w).toHaveLength(24);
    expect(w[ROUND_LAYOUTS[2].indexOf('TRIP')]).toEqual({ kind: 'cash', value: 500 });
  });

  it('Round 3 has the Express wedge ($1,000) and no Mystery wedge or trip', () => {
    const w = buildWheel(3);
    expect(w.filter((x) => x.kind === 'express')).toEqual([{ kind: 'express', value: 1000 }]);
    expect(count(w, 'mystery') + count(w, 'trip')).toBe(0);
  });

  it('Round 4 has no special wedges', () => {
    const w = buildWheel(4);
    for (const kind of ['wild-card', 'million', 'trip', 'mystery', 'express'] as const)
      expect(count(w, kind)).toBe(0);
    expect(w.filter((x) => x.kind === 'cash')).toHaveLength(21);
  });

  it('a Wild Card or Million wedge that is gone is replaced by $500 and the wheel stays 24', () => {
    for (const r of [1, 2, 3] as RoundNo[]) {
      const w = buildWheel(r, NONE);
      expect(w).toHaveLength(24);
      expect(count(w, 'wild-card') + count(w, 'million') + count(w, 'trip')).toBe(0);
    }
    const w = buildWheel(1, { ...NONE, wildCard: false, million: true });
    expect(w[ROUND_LAYOUTS[1].indexOf('WILD')]).toEqual({ kind: 'cash', value: 500 });
  });

  it('after a Mystery flip the flipped wedge is $500 and the other is a plain $1,000', () => {
    const idx = ROUND_LAYOUTS[2].indexOf('MYSTERY');
    const other = ROUND_LAYOUTS[2].lastIndexOf('MYSTERY');
    const w = buildWheel(2, { ...FRESH_SPECIALS, mysteryFlipped: idx });
    expect(w[idx]).toEqual({ kind: 'cash', value: 500 });
    expect(w[other]).toEqual({ kind: 'cash', value: 1000 });
    expect(count(w, 'mystery')).toBe(0);
  });

  it('no two neighbouring wedges share a cash value (the layout is reconstructed, spread out)', () => {
    for (const r of [1, 2, 3, 4] as RoundNo[]) {
      const t = ROUND_LAYOUTS[r];
      t.forEach((x, i) => {
        const y = t[(i + 1) % t.length];
        if (typeof x === 'number') expect(y).not.toBe(x);
      });
    }
  });
});

describe('spinResult', () => {
  it('is deterministic: the same draw gives the same wedge', () => {
    const w = buildWheel(1);
    expect(spinResult(w, 0.4321)).toEqual(spinResult(w, 0.4321));
  });

  it('maps a draw in [0, 1) to a wedge index across all 24 wedges', () => {
    const w = buildWheel(4);
    expect(spinResult(w, 0).index).toBe(0);
    expect(spinResult(w, 0.9999999).index).toBe(23);
    for (let i = 0; i < 24; i++) expect(spinResult(w, drawForIndex(i)).index).toBe(i);
  });

  it('clamps out-of-range and non-finite draws instead of throwing', () => {
    const w = buildWheel(4);
    expect(spinResult(w, -3).index).toBe(0);
    expect(spinResult(w, 7).index).toBe(23);
    expect(spinResult(w, Number.NaN).index).toBe(0);
  });

  it('splits the Million Dollar Wedge in thirds: Bankrupt, ONE MILLION, Bankrupt', () => {
    const w = buildWheel(1);
    const i = w.findIndex((x) => x.kind === 'million');
    const kinds = ([0, 1, 2] as const).map((t) => spinResult(w, drawForIndex(i, t)));
    expect(kinds.map((k) => k.third)).toEqual([0, 1, 2]);
    expect(kinds.map((k) => k.effective.kind)).toEqual(['bankrupt', 'million', 'bankrupt']);
    expect(kinds[1]?.landed.kind).toBe('million');
  });

  it('other wedges have no third', () => {
    const w = buildWheel(1);
    expect(spinResult(w, 0.01).third).toBeNull();
  });

  it('wedgeValue is 0 for Bankrupt, Lose a Turn and the Million third, and the per-letter pay otherwise', () => {
    expect(wedgeValue({ kind: 'bankrupt' })).toBe(0);
    expect(wedgeValue({ kind: 'lose-turn' })).toBe(0);
    expect(wedgeValue({ kind: 'million', value: 0 })).toBe(0);
    expect(wedgeValue({ kind: 'mystery', value: 1000 })).toBe(1000);
  });
});

describe('peg ticks', () => {
  it('counts one tick per wedge boundary the wheel turns past', () => {
    expect(pegTicks(0, 360)).toBe(24);
    expect(pegTicks(0, 14.9)).toBe(0);
    expect(pegTicks(14, 16)).toBe(1);
    expect(pegTicks(0, 720 + 100)).toBe(48 + 6);
    expect(pegTicks(100, 40)).toBe(pegTicks(40, 100));
  });

  it('spinRotation turns the given full turns and then stops at the draw', () => {
    expect(spinRotation(0.25, 5)).toBe(5 * 360 + 90);
    expect(pegTicks(0, spinRotation(0.5, 4))).toBe(4 * 24 + 12);
  });
});
