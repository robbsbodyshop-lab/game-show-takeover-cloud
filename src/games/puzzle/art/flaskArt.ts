/**
 * Flask frames: glass walls around the 8x16 board with a narrow neck on top. Player 1's flask has a
 * sun trim, player 2's a tide trim. Flat tones with a two-tone bevel and ink outlines, no gradients.
 */
import {
  BOARD_H,
  BOARD_W,
  BOARD_X,
  BOARD_Y,
  CELL,
  FLASK_H,
  FLASK_W,
  NECK_H,
  NECK_INNER_H,
  NECK_INNER_W,
  NECK_INNER_X,
  NECK_INNER_Y,
  WALL,
} from '../layout.ts';
import { DEEP, LAGOON, NIGHT, SHADE, SUN, TIDE } from './palette.ts';
import { Grid, INK, Mask } from './pixelGrid.ts';
import type { SpriteArt, Tones } from './pixelGrid.ts';

const flask = (id: string, trim: Tones): SpriteArt => {
  // Interior (where cells and the next capsule are drawn), then glass walls grown around it.
  const interior = new Mask(FLASK_W, FLASK_H)
    .rect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H)
    .rect(NECK_INNER_X, NECK_INNER_Y, NECK_INNER_W, NECK_INNER_H + 1);
  const dist = (x: number, y: number): number => {
    // Chebyshev distance to the interior, up to WALL + 1.
    for (let d = 1; d <= WALL + 1; d++) {
      for (let j = -d; j <= d; j++) {
        for (let i = -d; i <= d; i++) {
          if (Math.max(Math.abs(i), Math.abs(j)) === d && interior.has(x + i, y + j)) return d;
        }
      }
    }
    return WALL + 2;
  };
  const grid = new Grid(FLASK_W, FLASK_H);
  const cx = FLASK_W / 2;
  for (let y = 0; y < FLASK_H; y++) {
    for (let x = 0; x < FLASK_W; x++) {
      if (interior.has(x, y)) {
        // Night well with a faint dot at each cell corner.
        const dot = (x - BOARD_X) % CELL === 0 && (y - BOARD_Y) % CELL === 0 && y >= BOARD_Y;
        grid.set(x, y, dot ? LAGOON : NIGHT);
        continue;
      }
      const d = dist(x, y);
      if (d > WALL) continue;
      // Chamfer the outer shoulders so the body reads as a flask rather than a box.
      const shoulder = y >= NECK_H - WALL && y < NECK_H;
      const fromEdge = Math.min(x, FLASK_W - 1 - x);
      if (shoulder && fromEdge + (y - (NECK_H - WALL)) < WALL - 1) continue;
      const lit = x < cx && y < FLASK_H - WALL;
      let colour: string;
      if (d === 1) colour = INK;
      else if (d === 2) colour = lit ? trim.light : trim.base;
      else if (d <= 4) colour = lit ? trim.base : trim.dark;
      else if (d <= 6) colour = lit ? DEEP : LAGOON;
      else colour = lit ? LAGOON : SHADE;
      grid.set(x, y, colour);
    }
  }
  // Outer ink edge: any wall pixel next to empty space.
  const edge: [number, number][] = [];
  for (let y = 0; y < FLASK_H; y++) {
    for (let x = 0; x < FLASK_W; x++) {
      if (grid.get(x, y) === null) continue;
      const open = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx = 0, dy = 0]) => {
        const nx = x + dx;
        const ny = y + dy;
        return !grid.inside(nx, ny) || grid.get(nx, ny) === null;
      });
      if (open) edge.push([x, y]);
    }
  }
  for (const [x, y] of edge) grid.set(x, y, INK);
  // Bulbs along the rim of the neck cap.
  for (let x = NECK_INNER_X - 2; x < NECK_INNER_X + NECK_INNER_W + 2; x += 6)
    grid.rect(x, 2, 2, 2, trim.light);
  return grid.toArt(id);
};

export const flaskArt = (): SpriteArt[] => [flask('flask-frame-1p', SUN), flask('flask-frame-2p', TIDE)];
