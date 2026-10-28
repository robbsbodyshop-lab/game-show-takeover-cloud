/**
 * Tiny pixel-art toolkit for the puzzle sprite sheet. Sprites are drawn procedurally from shapes
 * (masks), then outlined and bevel-shaded the same way, so the whole sheet shares one look.
 */

/** A `#rrggbb` colour, or null for a transparent pixel. */
export type Pixel = string | null;

export interface SpriteArt {
  id: string;
  width: number;
  height: number;
  /** Row-major, `width * height` entries. */
  pixels: Pixel[];
}

export interface Tones {
  base: string;
  light: string;
  dark: string;
}

export const INK = '#0B0620';
export const CREAM = '#FFF6DC';

export class Grid {
  readonly pixels: Pixel[];
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.pixels = Array.from({ length: width * height }, () => null);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): Pixel {
    return this.inside(x, y) ? (this.pixels[y * this.width + x] ?? null) : null;
  }

  set(x: number, y: number, colour: Pixel): void {
    if (this.inside(x, y)) this.pixels[y * this.width + x] = colour;
  }

  rect(x: number, y: number, w: number, h: number, colour: Pixel): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, colour);
  }

  toArt(id: string): SpriteArt {
    return { id, width: this.width, height: this.height, pixels: [...this.pixels] };
  }
}

/** A boolean silhouette on a fixed-size grid. */
export class Mask {
  readonly bits: boolean[];
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.bits = Array.from({ length: width * height }, () => false);
  }

  has(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height && this.bits[y * this.width + x] === true;
  }

  set(x: number, y: number, on = true): void {
    if (x >= 0 && y >= 0 && x < this.width && y < this.height) this.bits[y * this.width + x] = on;
  }

  /** Pixels whose centre satisfies `test(cx, cy)` are added. */
  fill(test: (cx: number, cy: number) => boolean): this {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) if (test(x + 0.5, y + 0.5)) this.set(x, y);
    }
    return this;
  }

  disc(cx: number, cy: number, r: number): this {
    return this.fill((x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number): this {
    return this.fill((x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);
  }

  rect(x: number, y: number, w: number, h: number): this {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j);
    return this;
  }

  erase(x: number, y: number, w: number, h: number): this {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, false);
    return this;
  }

  /** A line of pixels from (x0,y0) to (x1,y1), in pixel coordinates. */
  line(x0: number, y0: number, x1: number, y1: number): this {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 || 1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.set(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t));
    }
    return this;
  }

  rotateCw(): Mask {
    const out = new Mask(this.height, this.width);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) if (this.has(x, y)) out.set(this.height - 1 - y, x);
    }
    return out;
  }

  mirror(): Mask {
    const out = new Mask(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) if (this.has(x, y)) out.set(this.width - 1 - x, y);
    }
    return out;
  }
}

export type Side = 'left' | 'right' | 'up' | 'down';

const NEIGHBOURS: readonly (readonly [number, number, Side])[] = [
  [-1, 0, 'left'],
  [1, 0, 'right'],
  [0, -1, 'up'],
  [0, 1, 'down'],
];

/**
 * Paints a silhouette: ink outline just outside it, `tones.light` on rims that face up/left,
 * `tones.dark` on rims that face down/right, `tones.base` elsewhere. Sides listed in `open` have no
 * outline (a capsule half joins its partner there).
 */
export const paint = (mask: Mask, tones: Tones, open: readonly Side[] = []): Grid => {
  const grid = new Grid(mask.width, mask.height);
  const isOpenEdge = (x: number, y: number, side: Side): boolean => {
    if (!open.includes(side)) return false;
    if (side === 'left') return x < 0;
    if (side === 'right') return x >= mask.width;
    if (side === 'up') return y < 0;
    return y >= mask.height;
  };
  const solid = (x: number, y: number, side: Side): boolean => mask.has(x, y) || isOpenEdge(x, y, side);
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (mask.has(x, y)) {
        const up = solid(x, y - 1, 'up');
        const left = solid(x - 1, y, 'left');
        const down = solid(x, y + 1, 'down');
        const right = solid(x + 1, y, 'right');
        let colour = tones.base;
        if (!up || !left) colour = tones.light;
        else if (!down || !right) colour = tones.dark;
        grid.set(x, y, colour);
      } else if (NEIGHBOURS.some(([dx, dy, side]) => mask.has(x + dx, y + dy) && !isOpenEdge(x, y, side))) {
        grid.set(x, y, INK);
      }
    }
  }
  return grid;
};
