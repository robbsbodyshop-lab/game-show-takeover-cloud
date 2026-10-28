/**
 * Rasterises `public/puzzle/sprites.svg` once into an offscreen canvas at `PIXEL_SCALE` (2x) and blits
 * cells from it. The main canvas context is scaled by the same factor, so every blit is 1:1 with
 * smoothing off and the pixels stay hard-edged.
 */
import { logger } from '@/lib/logger';
import type { Ctx2D } from './canvasTypes';
import { PIXEL_SCALE } from './layout';
import { SHEET_HEIGHT, SHEET_WIDTH, SPRITES, SPRITE_SHEET_URL } from './sprites';
import type { SpriteId } from './sprites';

export interface SpriteSheet {
  /** Draw sprite `id` with its top-left at (x, y) in logical (1x) pixels of a context scaled by `PIXEL_SCALE`. */
  blit(ctx: Ctx2D, id: SpriteId, x: number, y: number): void;
}

export interface RasterSurface {
  width: number;
  height: number;
  getContext(kind: '2d'): Pick<CanvasRenderingContext2D, 'drawImage' | 'imageSmoothingEnabled'> | null;
}

export interface RasteriseDeps {
  loadImage(url: string): Promise<CanvasImageSource>;
  createSurface(width: number, height: number): RasterSurface;
}

export const isSpriteId = (id: string): id is SpriteId => id in SPRITES;

/** Build a sheet from an image of the SVG. Rejects when the image cannot be drawn. */
export const rasteriseSheet = async (url: string, deps: RasteriseDeps): Promise<SpriteSheet> => {
  const image = await deps.loadImage(url);
  const width = SHEET_WIDTH * PIXEL_SCALE;
  const height = SHEET_HEIGHT * PIXEL_SCALE;
  const surface = deps.createSurface(width, height);
  const ctx = surface.getContext('2d');
  if (!ctx) throw new Error('no 2D context for the sprite sheet');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, width, height);
  const source = surface as unknown as CanvasImageSource;
  return {
    blit(target, id, x, y) {
      const r = SPRITES[id];
      target.drawImage(
        source,
        r.x * PIXEL_SCALE,
        r.y * PIXEL_SCALE,
        r.w * PIXEL_SCALE,
        r.h * PIXEL_SCALE,
        x,
        y,
        r.w,
        r.h,
      );
    },
  };
};

const browserDeps: RasteriseDeps = {
  loadImage: (url) =>
    new Promise<CanvasImageSource>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        resolve(image);
      };
      image.onerror = () => {
        reject(new Error(`cannot load ${url}`));
      };
      image.src = url;
    }),
  createSurface: (width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  },
};

let shared: Promise<SpriteSheet | null> | null = null;

/** The shared sheet: loaded and rasterised on first use, then reused. Resolves to null (one warning) on failure. */
export const loadSpriteSheet = (
  url: string = SPRITE_SHEET_URL,
  deps: RasteriseDeps = browserDeps,
): Promise<SpriteSheet | null> => {
  shared ??= rasteriseSheet(url, deps).catch((error: unknown) => {
    logger.warn('puzzle sprites unavailable', error instanceof Error ? error.message : error);
    return null;
  });
  return shared;
};

/** Test hook: forget the shared sheet. */
export const resetSpriteSheetCache = (): void => {
  shared = null;
};
