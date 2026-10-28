/**
 * Plinko finale (HOST_FEATURE_INVENTORY.md 1.6, FR-053, TD-004). Pure helpers; the event reducer
 * spends chips and adds points.
 *
 * Board: 9 slots worth [100,200,300,500,1000,500,300,200,100] and 8 peg rows. A disc starts in
 * the centre of the chosen column (slots are numbered 0..8) and each peg row nudges it half a slot
 * left (draw < 0.5) or right (draw >= 0.5). The position is tracked in half-slot units
 * x = 0..16 (even x = a slot centre) and clamped to the board after every row. After eight rows
 * an odd x (only possible after touching a wall) resolves to the neighbouring slot nearer the
 * middle, so the result is always a slot in 0..8 and the walk is symmetric left/right.
 */
import type { PlinkoDrop, PlinkoState } from './types';

export const PLINKO_ROWS = 8;
export const PLINKO_SLOT_VALUES: readonly number[] = [100, 200, 300, 500, 1000, 500, 300, 200, 100];
export const PLINKO_SLOT_COUNT = PLINKO_SLOT_VALUES.length;

export interface DropPath {
  column: number;
  /** -1 = left, +1 = right, one per peg row. */
  steps: (-1 | 1)[];
  /** x after each peg row, half-slot units. */
  xs: number[];
  slot: number;
}

export function createPlinkoState(): PlinkoState {
  return { selections: [], drops: [] };
}

export function isValidColumn(column: number, slotCount = PLINKO_SLOT_COUNT): boolean {
  return Number.isInteger(column) && column >= 0 && column < slotCount;
}

export function isValidPlinkoDraw(draw: readonly number[]): boolean {
  return draw.length === PLINKO_ROWS && draw.every((d) => Number.isFinite(d) && d >= 0 && d < 1);
}

/**
 * Path of one disc. `draw` has exactly 8 numbers in [0, 1); returns null for a bad column or
 * draw. Deterministic: the same inputs always give the same path.
 */
export function dropPath(
  column: number,
  draw: readonly number[],
  slotCount = PLINKO_SLOT_COUNT,
): DropPath | null {
  if (!isValidColumn(column, slotCount) || !isValidPlinkoDraw(draw)) return null;
  const maxX = (slotCount - 1) * 2;
  const mid = (slotCount - 1) / 2;
  let x = column * 2;
  const steps: (-1 | 1)[] = [];
  const xs: number[] = [];
  for (const d of draw) {
    const step = d < 0.5 ? -1 : 1;
    x = Math.min(maxX, Math.max(0, x + step));
    steps.push(step);
    xs.push(x);
  }
  const slot = x % 2 === 0 ? x / 2 : (x - 1) / 2 + (x / 2 < mid ? 1 : 0);
  return { column, steps, xs, slot };
}

export function selectedColumn(plinko: PlinkoState, team: number): number | null {
  return plinko.selections.find((s) => s.team === team)?.column ?? null;
}

export function selectColumn(plinko: PlinkoState, team: number, column: number): PlinkoState {
  if (!isValidColumn(column)) return plinko;
  if (selectedColumn(plinko, team) === column) return plinko;
  return {
    ...plinko,
    selections: [...plinko.selections.filter((s) => s.team !== team), { team, column }].sort(
      (a, b) => a.team - b.team,
    ),
  };
}

/** Log a finished drop and clear that team's column choice (it picks again for the next chip). */
export function recordDrop(plinko: PlinkoState, drop: PlinkoDrop): PlinkoState {
  return {
    selections: plinko.selections.filter((s) => s.team !== drop.team),
    drops: [...plinko.drops, drop],
  };
}

export function slotValue(values: readonly number[], slot: number): number {
  return values[slot] ?? 0;
}
