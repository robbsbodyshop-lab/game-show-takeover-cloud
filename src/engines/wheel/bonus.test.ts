import { describe, expect, it } from 'vitest';
import { bonusEnvelopes, bonusQuota, bonusRemaining, checkBonusCall, spinBonus } from './bonus';

describe('Bonus Wheel', () => {
  it('has 24 envelopes from $40,000 to $100,000', () => {
    const e = bonusEnvelopes(false);
    expect(e).toHaveLength(24);
    for (const x of e) {
      expect(x.value).toBeGreaterThanOrEqual(40000);
      expect(x.value).toBeLessThanOrEqual(100000);
    }
  });

  it('six envelopes are a car worth $40,000', () => {
    const cars = bonusEnvelopes(false).filter((x) => x.kind === 'car');
    expect(cars).toHaveLength(6);
    for (const c of cars) expect(c.value).toBe(40000);
  });

  it('there is one $100,000 envelope, and the Million Dollar Wedge turns it into $1,000,000', () => {
    expect(bonusEnvelopes(false).filter((x) => x.value === 100000)).toHaveLength(1);
    const withMillion = bonusEnvelopes(true);
    expect(withMillion.filter((x) => x.value === 1000000)).toHaveLength(1);
    expect(withMillion.filter((x) => x.value === 100000)).toHaveLength(0);
    expect(withMillion.filter((x) => x.kind === 'car')).toHaveLength(6);
  });

  it('maps a draw to an envelope index deterministically', () => {
    expect(spinBonus(0)).toBe(0);
    expect(spinBonus(0.999999)).toBe(23);
    expect(spinBonus(0.5)).toBe(12);
    expect(spinBonus(Number.NaN)).toBe(0);
  });
});

describe('Bonus letters', () => {
  it('three consonants and one vowel; four consonants with a Wild Card', () => {
    expect(bonusQuota(false)).toEqual({ consonants: 3, vowels: 1 });
    expect(bonusQuota(true)).toEqual({ consonants: 4, vowels: 1 });
  });

  it('counts what is left and says when the calls are complete', () => {
    expect(bonusRemaining([], false)).toEqual({ consonants: 3, vowels: 1, complete: false });
    expect(bonusRemaining(['B', 'C', 'D', 'A'], false).complete).toBe(true);
    expect(bonusRemaining(['B', 'C', 'D', 'A'], true).complete).toBe(false);
  });

  it('asks again for repeats, given letters, invalid input and a full quota', () => {
    expect(checkBonusCall('b', [], false)).toEqual({ ok: true, letter: 'B' });
    expect(checkBonusCall('B', ['B'], false)).toEqual({ ok: false, reason: 'repeat' });
    expect(checkBonusCall('R', [], false)).toEqual({ ok: false, reason: 'given' });
    expect(checkBonusCall('E', [], false)).toEqual({ ok: false, reason: 'given' });
    expect(checkBonusCall('7', [], false)).toEqual({ ok: false, reason: 'invalid' });
    expect(checkBonusCall('BC', [], false)).toEqual({ ok: false, reason: 'invalid' });
    expect(checkBonusCall('F', ['B', 'C', 'D'], false)).toEqual({ ok: false, reason: 'quota' });
    expect(checkBonusCall('A', ['A'], false)).toEqual({ ok: false, reason: 'repeat' });
    expect(checkBonusCall('O', ['A'], false)).toEqual({ ok: false, reason: 'quota' });
  });
});
