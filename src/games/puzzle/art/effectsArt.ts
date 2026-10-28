/** Clear bursts, crown, heart cursor, selection markers and the garbage warning pip. */
import { COLOR_IDS, SUN, TIDE, TONES } from './palette.ts';
import type { ColorId } from './palette.ts';
import { CREAM, Grid, Mask, paint } from './pixelGrid.ts';
import type { SpriteArt, Tones } from './pixelGrid.ts';

const SIZE = 16;

const burst = (color: ColorId, frame: 1 | 2 | 3 | 4): SpriteArt => {
  const tones = TONES[color];
  const grid = new Grid(SIZE, SIZE);
  const ring = (r: number, colour: string): void => {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
        if (Math.abs(d - r) < 0.55) grid.set(x, y, colour);
      }
    }
  };
  const spokes = (from: number, to: number, colour: string, diagonalToo: boolean): void => {
    for (let k = 0; k < 8; k++) {
      if (!diagonalToo && k % 2 === 1) continue;
      const angle = (k * Math.PI) / 4;
      for (let s = from; s <= to; s += 0.5) {
        grid.set(Math.floor(8 + Math.cos(angle) * s), Math.floor(8 + Math.sin(angle) * s), colour);
      }
    }
  };
  if (frame === 1) {
    grid.set(7, 7, CREAM);
    grid.set(8, 7, CREAM);
    grid.set(7, 8, CREAM);
    grid.set(8, 8, CREAM);
    ring(3.2, tones.base);
    ring(2.2, tones.light);
    grid.rect(7, 7, 2, 2, CREAM);
  } else if (frame === 2) {
    spokes(2, 6.5, tones.base, true);
    spokes(2, 4, tones.light, false);
    grid.rect(7, 7, 2, 2, CREAM);
  } else if (frame === 3) {
    ring(6, tones.light);
    spokes(5, 7.5, tones.base, true);
  } else {
    spokes(6.5, 7.5, tones.light, true);
    for (const [x, y] of [
      [3, 5],
      [12, 4],
      [4, 11],
      [11, 12],
    ] as const) {
      grid.set(x, y, tones.base);
    }
  }
  return grid.toArt(`clear-burst-${color.toString()}-f${frame.toString()}`);
};

export const burstArt = (): SpriteArt[] =>
  COLOR_IDS.flatMap((color) => ([1, 2, 3, 4] as const).map((frame) => burst(color, frame)));

export const crownArt = (): SpriteArt => {
  const mask = new Mask(SIZE, SIZE);
  const tops = [4, 3, 4, 6, 6, 4, 2, 2, 4, 6, 6, 4, 3, 4];
  tops.forEach((top, i) => {
    for (let y = top; y <= 12; y++) mask.set(1 + i, y);
  });
  const grid = paint(mask, SUN);
  grid.rect(2, 10, 12, 1, SUN.dark);
  grid.rect(3, 11, 1, 1, TONES[1].base);
  grid.rect(12, 11, 1, 1, TONES[1].base);
  grid.rect(7, 11, 2, 1, TIDE.base);
  grid.set(2, 3, CREAM);
  grid.set(7, 2, CREAM);
  return grid.toArt('crown');
};

export const heartArt = (): SpriteArt => {
  const mask = new Mask(SIZE, SIZE).fill((px, py) => {
    const x = (px - 8) / 5.2;
    const y = (9.2 - py) / 5.2;
    return (x * x + y * y - 1) ** 3 - x * x * y ** 3 <= 0;
  });
  const grid = paint(mask, TONES[1]);
  grid.rect(4, 5, 2, 1, CREAM);
  grid.set(4, 6, CREAM);
  return grid.toArt('cursor-heart');
};

const triangle = (width: number, rows: number, step: number, pointDown: boolean): Mask => {
  const mask = new Mask(width + 2, rows + 2);
  for (let r = 0; r < rows; r++) {
    const w = width - r * step;
    const y = pointDown ? 1 + r : 1 + (rows - 1 - r);
    mask.rect(1 + Math.floor((width - w) / 2), y, w, 1);
  }
  return mask;
};

const markerTones = (player: 1 | 2): Tones => (player === 1 ? SUN : TIDE);

export const markerArt = (): SpriteArt[] => [
  paint(triangle(12, 6, 2, true), markerTones(1)).toArt('marker-level-p1'),
  paint(triangle(12, 6, 2, false), markerTones(2)).toArt('marker-level-p2'),
  paint(triangle(22, 6, 4, true), markerTones(1)).toArt('marker-speed-p1'),
  paint(triangle(22, 6, 4, false), markerTones(2)).toArt('marker-speed-p2'),
];

export const pipArt = (): SpriteArt => {
  const mask = new Mask(8, 8)
    .rect(1, 1, 6, 6)
    .erase(1, 1, 1, 1)
    .erase(6, 1, 1, 1)
    .erase(1, 6, 1, 1)
    .erase(6, 6, 1, 1);
  const grid = paint(mask, TONES[1]);
  grid.rect(3, 2, 2, 2, CREAM);
  grid.rect(3, 5, 2, 1, CREAM);
  return grid.toArt('garbage-warning-pip');
};
