/** Capsule halves: 16x16 each, five orientations per colour. */
import { COLOR_IDS, TONES } from './palette.ts';
import type { ColorId } from './palette.ts';
import { CREAM, Mask, paint } from './pixelGrid.ts';
import type { Grid, Side, SpriteArt } from './pixelGrid.ts';

export type HalfShape = 'lone' | 'left' | 'right' | 'top' | 'bottom';
export const HALF_SHAPES: readonly HalfShape[] = ['lone', 'left', 'right', 'top', 'bottom'];

const SIZE = 16;

/** Left half of a horizontal capsule: round on the left, open on the right edge of the cell. */
const leftHalf = (): Mask =>
  new Mask(SIZE, SIZE).fill((x, y) => {
    const dy = Math.abs(y - 8);
    if (x < 1) return false;
    if (x < 7) return (7 - x) ** 2 + dy ** 2 <= 36;
    return dy <= 6;
  });

const maskFor = (shape: HalfShape): { mask: Mask; open: Side[]; centre: [number, number] } => {
  switch (shape) {
    case 'lone':
      return { mask: new Mask(SIZE, SIZE).disc(8, 8, 6), open: [], centre: [8, 8] };
    case 'left':
      return { mask: leftHalf(), open: ['right'], centre: [9, 8] };
    case 'right':
      return { mask: leftHalf().mirror(), open: ['left'], centre: [6, 8] };
    case 'top':
      return { mask: leftHalf().rotateCw(), open: ['down'], centre: [8, 9] };
    case 'bottom':
      return { mask: leftHalf().mirror().rotateCw(), open: ['up'], centre: [8, 6] };
  }
};

/**
 * A small mark per colour so the three colours differ by shape as well as hue:
 * ember is a dot, sun a plus, tide a dash.
 */
const stampMark = (grid: Grid, color: ColorId, cx: number, cy: number): void => {
  const dark = TONES[color].dark;
  if (color === 1) grid.rect(cx - 1, cy - 1, 2, 2, dark);
  else if (color === 2) {
    grid.rect(cx - 1, cy, 3, 1, dark);
    grid.rect(cx, cy - 1, 1, 3, dark);
  } else grid.rect(cx - 2, cy, 4, 1, dark);
};

export const capsuleArt = (): SpriteArt[] => {
  const out: SpriteArt[] = [];
  for (const color of COLOR_IDS) {
    for (const shape of HALF_SHAPES) {
      const { mask, open, centre } = maskFor(shape);
      const grid = paint(mask, TONES[color], open);
      // A cream glint near the upper-left of the body.
      if (shape === 'top' || shape === 'bottom') grid.rect(4, shape === 'top' ? 3 : 2, 1, 2, CREAM);
      else grid.rect(3, 4, 2, 1, CREAM);
      stampMark(grid, color, centre[0], centre[1]);
      out.push(grid.toArt(`capsule-half-${color.toString()}-${shape}`));
    }
  }
  return out;
};
