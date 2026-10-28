/**
 * Three original germs, 16x16, each with two idle frames (a, b) and a hit flash:
 *   1 spiky ember, 2 blobby sun, 3 square tide with a visor.
 */
import { COLOR_IDS, TONES } from './palette.ts';
import type { ColorId } from './palette.ts';
import { CREAM, INK, Mask, paint } from './pixelGrid.ts';
import type { Grid, SpriteArt, Tones } from './pixelGrid.ts';

type Frame = 'a' | 'b';
const SIZE = 16;

const spiky = (frame: Frame): Mask => {
  const mask = new Mask(SIZE, SIZE).disc(8, 8.5, frame === 'a' ? 4.8 : 4.4);
  for (let k = 0; k < 8; k++) {
    const angle = (k * Math.PI) / 4;
    const diagonal = k % 2 === 1;
    // The two frames swap which spikes are long, so the germ seems to pulse.
    const reach = frame === 'a' ? (diagonal ? 6.2 : 7) : diagonal ? 7 : 6.2;
    for (let s = 3.5; s <= reach; s += 0.25) {
      const x = Math.round(8 + Math.cos(angle) * s - 0.5);
      const y = Math.round(8.5 + Math.sin(angle) * s - 0.5);
      mask.set(x, y);
      if (s < 5.2) {
        mask.set(x + (diagonal ? 1 : 0), y + (diagonal ? 0 : 1));
      }
    }
  }
  return mask;
};

const blobby = (frame: Frame): Mask => {
  const mask = new Mask(SIZE, SIZE);
  if (frame === 'a') {
    mask.ellipse(8, 9, 5.8, 4.8).disc(5, 6, 2.6).disc(11.2, 6.4, 2.9).rect(5, 12, 2, 2).rect(10, 12, 2, 2);
  } else {
    mask.ellipse(8, 8.4, 5.2, 5.4).disc(5.2, 5, 2.6).disc(11, 5.4, 2.9).rect(6, 12, 2, 2).rect(9, 12, 2, 2);
  }
  return mask;
};

const visor = (frame: Frame): Mask => {
  const mask = new Mask(SIZE, SIZE).rect(3, 3, 10, 10);
  mask.erase(3, 3, 1, 1).erase(12, 3, 1, 1).erase(3, 12, 1, 1).erase(12, 12, 1, 1);
  // Feet step in turn; the antenna leans.
  if (frame === 'a') mask.rect(4, 13, 2, 1).rect(10, 13, 2, 1).rect(8, 1, 1, 2).rect(7, 0, 2, 1);
  else mask.rect(5, 13, 2, 1).rect(9, 13, 2, 1).rect(8, 2, 1, 1).rect(9, 1, 1, 1).rect(9, 0, 2, 1);
  return mask;
};

const face = (grid: Grid, color: ColorId, frame: Frame, tones: Tones): void => {
  const eye = (x: number, y: number, w = 2, h = 2): void => {
    grid.rect(x, y, w, h, CREAM);
    grid.set(x + w - 1, y + h - 1, INK);
  };
  if (color === 1) {
    eye(5, 7);
    eye(9, 7);
    grid.set(5, 6, INK);
    grid.set(6, 6, INK);
    grid.set(9, 6, INK);
    grid.set(10, 6, INK);
    grid.rect(6, 11, 4, 1, INK);
    grid.set(6, 12, CREAM);
    grid.set(9, 12, CREAM);
  } else if (color === 2) {
    const dy = frame === 'a' ? 0 : -1;
    eye(5, 7 + dy, 2, 3);
    eye(9, 7 + dy, 2, 3);
    grid.rect(6, 11 + dy, 4, 1, INK);
    grid.set(5, 10 + dy, INK);
    grid.set(10, 10 + dy, INK);
    grid.set(4, 9 + dy, tones.dark);
    grid.set(11, 9 + dy, tones.dark);
  } else {
    grid.rect(4, 6, 8, 3, INK);
    const shift = frame === 'a' ? 0 : 1;
    grid.rect(5 + shift, 7, 2, 1, tones.light);
    grid.rect(9 + shift, 7, 2, 1, tones.light);
    grid.rect(6, 10, 4, 1, tones.dark);
    grid.rect(6, 11, 4, 1, INK);
  }
};

const hitFace = (grid: Grid, color: ColorId): void => {
  // Crossed eyes on a flashed body.
  const cross = (x: number, y: number): void => {
    grid.set(x, y, INK);
    grid.set(x + 2, y, INK);
    grid.set(x + 1, y + 1, INK);
    grid.set(x, y + 2, INK);
    grid.set(x + 2, y + 2, INK);
  };
  const y = color === 3 ? 6 : 7;
  cross(4, y);
  cross(9, y);
  grid.rect(6, 12, 4, 1, INK);
};

export const germArt = (): SpriteArt[] => {
  const out: SpriteArt[] = [];
  const shapes: Record<ColorId, (frame: Frame) => Mask> = { 1: spiky, 2: blobby, 3: visor };
  for (const color of COLOR_IDS) {
    const tones = TONES[color];
    for (const frame of ['a', 'b'] as const) {
      const grid = paint(shapes[color](frame), tones);
      face(grid, color, frame, tones);
      out.push(grid.toArt(`germ-${color.toString()}-${frame}`));
    }
    const flash: Tones = { base: CREAM, light: '#FFFFFF', dark: tones.light };
    const hit = paint(shapes[color]('a'), flash);
    hitFace(hit, color);
    out.push(hit.toArt(`germ-${color.toString()}-hit`));
  }
  return out;
};
