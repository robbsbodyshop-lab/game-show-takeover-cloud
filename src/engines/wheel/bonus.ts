/**
 * The Bonus Wheel and Bonus Round letter rules. Rules: docs/WHEEL_OF_FORTUNE_RULES.md, "The Bonus Round".
 */
import { BONUS_GIVEN_LETTERS, isConsonant, isVowel, parseLetter } from './letters';

export type Envelope = { kind: 'cash'; value: number } | { kind: 'car'; value: number };

export const CAR_VALUE = 40000;
export const MILLION_VALUE = 1000000;
export const BONUS_ENVELOPE_COUNT = 24;

/**
 * 24 envelopes from $40,000 to $100,000: six are a car worth $40,000, eighteen are cash
 * (45k x2, 50k x2, 55k x2, 60k x2, 65k x2, 70k x2, 75k, 80k, 85k, 90k, 95k, 100k). Clockwise layout.
 * `0` marks a car.
 */
const LAYOUT: readonly number[] = [
  0, 60, 85, 45, 70, 0, 55, 100, 50, 75, 65, 0, 90, 45, 60, 95, 0, 70, 50, 80, 55, 0, 65, 0,
];

/** The Bonus Wheel; with the Million Dollar Wedge the $100,000 envelope is worth $1,000,000. */
export function bonusEnvelopes(hasMillionWedge: boolean): Envelope[] {
  return LAYOUT.map((k): Envelope => {
    if (k === 0) return { kind: 'car', value: CAR_VALUE };
    const value = k * 1000;
    return { kind: 'cash', value: hasMillionWedge && value === 100000 ? MILLION_VALUE : value };
  });
}

/** Index of the envelope a draw in [0, 1) lands on. */
export function spinBonus(draw: number, size: number = BONUS_ENVELOPE_COUNT): number {
  const d = Number.isFinite(draw) ? Math.min(Math.max(draw, 0), 1 - Number.EPSILON) : 0;
  return Math.min(Math.floor(d * size), size - 1);
}

export interface BonusQuota {
  consonants: number;
  vowels: number;
}

/** Three consonants and one vowel; four consonants with a Wild Card. */
export function bonusQuota(hasWildCard: boolean): BonusQuota {
  return { consonants: hasWildCard ? 4 : 3, vowels: 1 };
}

export interface BonusRemaining extends BonusQuota {
  complete: boolean;
}

/** What is still to call, given the letters the team has picked (RSTLNE are not counted). */
export function bonusRemaining(picked: readonly string[], hasWildCard: boolean): BonusRemaining {
  const q = bonusQuota(hasWildCard);
  const consonants = Math.max(0, q.consonants - picked.filter(isConsonant).length);
  const vowels = Math.max(0, q.vowels - picked.filter(isVowel).length);
  return { consonants, vowels, complete: consonants === 0 && vowels === 0 };
}

export type BonusCallCheck =
  { ok: true; letter: string } | { ok: false; reason: 'invalid' | 'given' | 'repeat' | 'quota' };

/** Repeats and invalid calls are simply asked again: they are rejected, never counted. */
export function checkBonusCall(
  input: string,
  picked: readonly string[],
  hasWildCard: boolean,
): BonusCallCheck {
  const letter = parseLetter(input);
  if (letter === null) return { ok: false, reason: 'invalid' };
  if (BONUS_GIVEN_LETTERS.includes(letter)) return { ok: false, reason: 'given' };
  if (picked.includes(letter)) return { ok: false, reason: 'repeat' };
  const left = bonusRemaining(picked, hasWildCard);
  if (isVowel(letter) ? left.vowels === 0 : left.consonants === 0) return { ok: false, reason: 'quota' };
  return { ok: true, letter };
}
