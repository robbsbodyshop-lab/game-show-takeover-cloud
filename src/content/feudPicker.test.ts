import { describe, expect, it } from 'vitest';
import { getFeudContent } from './data.ts';
import { ROUND_SIZE_RANGE, hasSingleClearTop, pickFastMoney, pickSurvey } from './feudPicker.ts';
import { seededRng } from './testUtils.ts';
import type { FeudSurvey } from './types.ts';

const { surveys, fastMoney } = getFeudContent();

const mk = (id: string, ...points: number[]): FeudSurvey => ({
  id,
  question: id,
  answers: points.map((p, i) => ({ answer: `A${i}`, points: p })),
});

describe('pickSurvey', () => {
  it.each([
    [1, 6, 8],
    [2, 5, 7],
    [3, 4, 6],
    [4, 4, 4],
  ] as const)('round %i picks %i to %i answers', (round, min, max) => {
    expect(ROUND_SIZE_RANGE[round]).toEqual({ min, max });
    const rng = seededRng(round);
    for (let i = 0; i < 60; i++) {
      const s = pickSurvey(round, [], rng);
      expect(s?.answers.length).toBeGreaterThanOrEqual(min);
      expect(s?.answers.length).toBeLessThanOrEqual(max);
    }
  });

  it('Sudden Death picks a survey with one clear #1', () => {
    const rng = seededRng(7);
    for (let i = 0; i < 60; i++) {
      const s = pickSurvey('sudden-death', [], rng);
      expect(s && hasSingleClearTop(s)).toBe(true);
    }
  });

  it('detects a tie at the top', () => {
    expect(hasSingleClearTop(mk('a', 30, 30, 20, 10))).toBe(false);
    expect(hasSingleClearTop(mk('a', 31, 30, 20, 10))).toBe(true);
  });

  it('never repeats while fresh surveys remain, across a whole event of picks', () => {
    const rng = seededRng(42);
    const used: string[] = [];
    for (const round of [1, 2, 3, 4, 'sudden-death', 1, 2, 3, 4] as const) {
      const s = pickSurvey(round, used, rng);
      expect(s).toBeDefined();
      expect(used).not.toContain(s?.id);
      used.push(s?.id ?? '');
    }
  });

  it('is deterministic for a seed', () => {
    expect(pickSurvey(1, [], seededRng(5))?.id).toBe(pickSurvey(1, [], seededRng(5))?.id);
  });

  it('prefers an unused survey in range over a used one', () => {
    const pool = [mk('used', 20, 15, 12, 10), mk('fresh', 30, 20, 10, 5)];
    for (let seed = 0; seed < 20; seed++) {
      expect(pickSurvey(4, ['used'], seededRng(seed), pool)?.id).toBe('fresh');
    }
  });

  it('takes an unused survey of the nearest size before reusing one in range', () => {
    const pool = [mk('used4', 40, 30, 20, 10), mk('fresh5', 30, 25, 20, 15, 10)];
    expect(pickSurvey(4, ['used4'], seededRng(1), pool)?.id).toBe('fresh5');
  });

  it('reuses only when the pool is dry, and still returns something', () => {
    const pool = [mk('a', 40, 30, 20, 10), mk('b', 35, 30, 20, 10)];
    const s = pickSurvey(4, ['a', 'b'], seededRng(1), pool);
    expect(['a', 'b']).toContain(s?.id);
  });

  it('Sudden Death prefers unused clear-#1 surveys, then reuses', () => {
    const pool = [mk('tied', 30, 30, 20, 10), mk('clear', 40, 20, 20, 10)];
    expect(pickSurvey('sudden-death', [], seededRng(3), pool)?.id).toBe('clear');
    expect(pickSurvey('sudden-death', ['clear'], seededRng(3), pool)?.id).toBe('clear');
  });

  it('returns undefined for an empty bank', () => {
    expect(pickSurvey(1, [], seededRng(1), [])).toBeUndefined();
  });

  it('keeps plenty of 4-answer surveys for round 4', () => {
    expect(surveys.filter((s) => s.answers.length === 4).length).toBeGreaterThanOrEqual(10);
  });
});

describe('pickFastMoney', () => {
  it('deals five distinct unused questions', () => {
    const used = fastMoney.slice(0, 30).map((q) => q.id);
    const dealt = pickFastMoney(used, seededRng(9));
    expect(dealt).toHaveLength(5);
    expect(new Set(dealt.map((q) => q.id)).size).toBe(5);
    for (const q of dealt) expect(used).not.toContain(q.id);
  });

  it('never repeats over consecutive games until the bank is dry', () => {
    const rng = seededRng(11);
    const used: string[] = [];
    for (let game = 0; game < 15; game++) {
      const dealt = pickFastMoney(used, rng);
      for (const q of dealt) {
        expect(used).not.toContain(q.id);
        used.push(q.id);
      }
    }
    expect(used).toHaveLength(75);
  });

  it('tops up with repeats only when fewer than five are fresh', () => {
    const used = fastMoney.slice(0, fastMoney.length - 3).map((q) => q.id);
    const dealt = pickFastMoney(used, seededRng(2));
    expect(dealt).toHaveLength(5);
    expect(new Set(dealt.map((q) => q.id)).size).toBe(5);
    expect(dealt.filter((q) => !used.includes(q.id))).toHaveLength(3);
  });
});
