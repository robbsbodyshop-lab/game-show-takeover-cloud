/**
 * The round wheels as data. Rules: docs/WHEEL_OF_FORTUNE_RULES.md, "The wheel".
 *
 * Every wheel has 24 wedges: cash $500-$900, one top-dollar wedge, two Bankrupts and one Lose a Turn,
 * plus the specials of that round. The layouts below are reconstructed from the show's current wheel
 * as far as reasonable (no published diagram exists): wedge 0 is the top-dollar wedge, indices run
 * clockwise, Bankrupts sit roughly opposite each other, no two equal cash values touch.
 *
 * Specials appear only while they are still in play. When one is claimed or lost its slot becomes a
 * $500 wedge ("replaced by $500"); a Mystery wedge left behind by a flip becomes a plain $1,000.
 */
import type { RoundNo, WedgeKind, WheelSpecials } from './types';

export const WEDGE_COUNT = 24;
export const TOP_DOLLAR: Record<RoundNo, number> = { 1: 2500, 2: 3500, 3: 3500, 4: 5000 };
export const CASH_VALUES: readonly number[] = [500, 550, 600, 650, 700, 800, 900];

/** Open question: the rules doc does not value the trip wedge's trip; this is the figure used. */
export const TRIP_WEDGE_PRIZE = { name: 'TRIP', value: 5000 } as const;
export const MYSTERY_PRIZE = { name: 'MYSTERY $10,000', value: 10000 } as const;
export const MYSTERY_VALUE = 1000;
export const EXPRESS_VALUE = 1000;
export const WILD_CARD_VALUE = 500;
export const TRIP_WEDGE_VALUE = 500;
export const REPLACEMENT_VALUE = 500;

export type Wedge =
  | { kind: 'cash'; value: number; top?: true }
  | { kind: 'bankrupt' }
  | { kind: 'lose-turn' }
  | { kind: 'wild-card'; value: number }
  | { kind: 'million'; value: number }
  | { kind: 'trip'; value: number }
  | { kind: 'mystery'; value: number }
  | { kind: 'express'; value: number };

type Token = number | 'TOP' | 'BANKRUPT' | 'LOSE' | 'WILD' | 'MILLION' | 'TRIP' | 'MYSTERY' | 'EXPRESS';

/**
 * Layout arrays, clockwise from the top-dollar wedge. A number is a plain cash wedge.
 * Round 1: Wild Card, Million Dollar Wedge, trip. Round 2: two Mystery wedges, the trip if still
 * unclaimed, and any Wild Card / Million wedge still unclaimed. Round 3: Express (and unclaimed
 * Wild Card / Million wedge). Round 4: no specials.
 */
export const ROUND_LAYOUTS: Record<RoundNo, readonly Token[]> = {
  1: [
    'TOP',
    600,
    'BANKRUPT',
    700,
    550,
    800,
    'WILD',
    500,
    900,
    'LOSE',
    650,
    600,
    'MILLION',
    700,
    500,
    550,
    'TRIP',
    900,
    600,
    'BANKRUPT',
    800,
    650,
    700,
    500,
  ],
  2: [
    'TOP',
    700,
    'BANKRUPT',
    550,
    800,
    'MYSTERY',
    600,
    900,
    'WILD',
    650,
    500,
    'LOSE',
    700,
    'TRIP',
    600,
    800,
    'MYSTERY',
    550,
    'BANKRUPT',
    900,
    500,
    'MILLION',
    650,
    600,
  ],
  3: [
    'TOP',
    600,
    'BANKRUPT',
    800,
    550,
    700,
    'EXPRESS',
    500,
    900,
    'LOSE',
    650,
    600,
    'WILD',
    700,
    500,
    550,
    800,
    900,
    600,
    'BANKRUPT',
    650,
    'MILLION',
    700,
    500,
  ],
  4: [
    'TOP',
    600,
    'BANKRUPT',
    800,
    550,
    700,
    500,
    900,
    650,
    'LOSE',
    600,
    700,
    500,
    550,
    800,
    900,
    600,
    'BANKRUPT',
    650,
    700,
    500,
    800,
    550,
    600,
  ],
};

export const FRESH_SPECIALS: WheelSpecials = {
  wildCard: true,
  million: true,
  trip: true,
  mysteryFlipped: null,
};

function resolve(token: Token, index: number, round: RoundNo, specials: WheelSpecials): Wedge {
  const plain: Wedge = { kind: 'cash', value: REPLACEMENT_VALUE };
  if (typeof token === 'number') return { kind: 'cash', value: token };
  switch (token) {
    case 'TOP':
      return { kind: 'cash', value: TOP_DOLLAR[round], top: true };
    case 'BANKRUPT':
      return { kind: 'bankrupt' };
    case 'LOSE':
      return { kind: 'lose-turn' };
    case 'WILD':
      return specials.wildCard ? { kind: 'wild-card', value: WILD_CARD_VALUE } : plain;
    case 'MILLION':
      return specials.million ? { kind: 'million', value: 0 } : plain;
    case 'TRIP':
      return specials.trip ? { kind: 'trip', value: TRIP_WEDGE_VALUE } : plain;
    case 'EXPRESS':
      return { kind: 'express', value: EXPRESS_VALUE };
    case 'MYSTERY':
      if (specials.mysteryFlipped === null) return { kind: 'mystery', value: MYSTERY_VALUE };
      return specials.mysteryFlipped === index ? plain : { kind: 'cash', value: MYSTERY_VALUE };
  }
}

/** The 24 wedges of a round's wheel given which specials are still in play. */
export function buildWheel(round: RoundNo, specials: WheelSpecials = FRESH_SPECIALS): Wedge[] {
  return ROUND_LAYOUTS[round].map((t, i) => resolve(t, i, round, specials));
}

export function wedgeKind(w: Wedge): WedgeKind {
  return w.kind;
}

/** Dollars paid per letter on a wedge (0 for Bankrupt, Lose a Turn and the Million third). */
export function wedgeValue(w: Wedge): number {
  return 'value' in w ? w.value : 0;
}

export interface SpinResult {
  index: number;
  /** For the Million Dollar Wedge: which third the pointer stopped in (0 and 2 are Bankrupt). */
  third: 0 | 1 | 2 | null;
  /** The wedge the pointer is on. */
  landed: Wedge;
  /** What the spin really is: a Million wedge's Bankrupt thirds are Bankrupts. */
  effective: Wedge;
}

/** Deterministic from a draw in [0, 1): wedge index, plus the sub-third for the Million wedge. */
export function spinResult(wheel: readonly Wedge[], draw: number): SpinResult {
  const n = wheel.length;
  const d = Number.isFinite(draw) ? Math.min(Math.max(draw, 0), 1 - Number.EPSILON) : 0;
  const scaled = d * n;
  const index = Math.min(Math.floor(scaled), n - 1);
  const landed = wheel[index] ?? { kind: 'bankrupt' };
  const frac = scaled - index;
  if (landed.kind !== 'million') return { index, third: null, landed, effective: landed };
  const third: 0 | 1 | 2 = frac < 1 / 3 ? 0 : frac < 2 / 3 ? 1 : 2;
  return { index, third, landed, effective: third === 1 ? landed : { kind: 'bankrupt' } };
}

/** The draw that lands the middle of wedge `index` (of a Million wedge: of the given third). */
export function drawForIndex(index: number, third: 0 | 1 | 2 = 1, size: number = WEDGE_COUNT): number {
  return (index + (third + 0.5) / 3) / size;
}

/** Degrees per wedge and the angle a draw maps to, so the UI animates what the engine decided. */
export function spinRotation(draw: number, fullTurns: number): number {
  return fullTurns * 360 + Math.min(Math.max(draw, 0), 1) * 360;
}

/** Peg ticks between two wheel angles (degrees): one per wedge boundary crossed. */
export function pegTicks(fromDeg: number, toDeg: number, size: number = WEDGE_COUNT): number {
  const step = 360 / size;
  return Math.abs(Math.floor(toDeg / step) - Math.floor(fromDeg / step));
}
