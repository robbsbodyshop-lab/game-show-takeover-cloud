/** Board geometry in SVG units (viewBox 1100 x 800). x positions use the engine's half-slot units. */
import { PLINKO_ROWS, PLINKO_SLOT_COUNT } from '@/engines/event';

export const BOARD_W = 1100;
export const BOARD_H = 800;
export const SLOT_W = 116;
export const BOARD_LEFT = 28;
export const SLOT_TOP = 650;
export const SLOT_H = 122;
export const CHIP_R = 22;
const FIRST_ROW_Y = 150;
export const ROW_GAP = 62;
export const START_Y = 76;
export const LAND_Y = 692;

/** Step counter of the chip animation: 0 = held above the column, 1..8 = after each peg row, 9 = in the slot. */
export const LANDED_STEP = PLINKO_ROWS + 1;

/** SVG x of a half-slot position (even = a slot centre). */
export const xPos = (halfSlots: number): number => BOARD_LEFT + SLOT_W / 2 + (halfSlots * SLOT_W) / 2;

export const slotCenter = (slot: number): number => xPos(slot * 2);

export const rowY = (row: number): number => FIRST_ROW_Y + row * ROW_GAP;

export interface Peg {
  row: number;
  x: number;
  y: number;
}

/** Row r holds pegs on the parity of the disc's x before it (even for row 0, odd for row 1 ...). */
export const buildPegs = (rows: number = PLINKO_ROWS, slots: number = PLINKO_SLOT_COUNT): Peg[] => {
  const maxX = (slots - 1) * 2;
  const pegs: Peg[] = [];
  for (let row = 0; row < rows; row++) {
    for (let x = row % 2; x <= maxX; x += 2) pegs.push({ row, x: xPos(x), y: rowY(row) });
  }
  return pegs;
};

export interface ChipPosition {
  x: number;
  y: number;
}

/** Where the chip sits at an animation step, from the engine's recorded half-slot positions. */
export const chipPosition = (
  column: number,
  xs: readonly number[],
  slot: number,
  step: number,
): ChipPosition => {
  if (step <= 0) return { x: slotCenter(column), y: START_Y };
  if (step >= LANDED_STEP) return { x: slotCenter(slot), y: LAND_Y };
  const x = xs[step - 1] ?? column * 2;
  return { x: xPos(x), y: rowY(step - 1) + ROW_GAP / 2 };
};

/** Flat fill class per value tier (read from the value itself so custom slot values still read well). */
export type SlotTier = 'top' | 'high' | 'mid' | 'low' | 'base';

export const slotTier = (value: number, max: number): SlotTier => {
  if (max <= 0) return 'base';
  const ratio = value / max;
  if (ratio >= 1) return 'top';
  if (ratio >= 0.5) return 'high';
  if (ratio >= 0.3) return 'mid';
  if (ratio >= 0.2) return 'low';
  return 'base';
};
