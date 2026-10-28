import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ctx2D } from './canvasTypes';
import { SPRITES, SHEET_HEIGHT, SHEET_WIDTH } from './sprites';
import { loadSpriteSheet, rasteriseSheet, resetSpriteSheetCache } from './spriteCanvas';
import type { RasterSurface, RasteriseDeps } from './spriteCanvas';

const makeDeps = () => {
  const draws: unknown[][] = [];
  const surface: RasterSurface = {
    width: 0,
    height: 0,
    getContext: () => ({
      imageSmoothingEnabled: true,
      drawImage: (...args: unknown[]) => {
        draws.push(args);
      },
    }),
  };
  const deps: RasteriseDeps = {
    loadImage: vi.fn(() => Promise.resolve({} as CanvasImageSource)),
    createSurface: vi.fn((w: number, h: number) => {
      surface.width = w;
      surface.height = h;
      return surface;
    }),
  };
  return { deps, draws, surface };
};

describe('rasteriseSheet', () => {
  beforeEach(() => {
    resetSpriteSheetCache();
  });

  it('draws the whole SVG once onto a 2x surface', async () => {
    const { deps, draws, surface } = makeDeps();
    await rasteriseSheet('/puzzle/sprites.svg', deps);
    expect(surface.width).toBe(SHEET_WIDTH * 2);
    expect(surface.height).toBe(SHEET_HEIGHT * 2);
    expect(draws).toHaveLength(1);
    expect(draws[0]?.slice(1)).toEqual([0, 0, SHEET_WIDTH * 2, SHEET_HEIGHT * 2]);
  });

  it('blits a cell from its 2x source rect into logical coordinates', async () => {
    const { deps } = makeDeps();
    const sheet = await rasteriseSheet('/puzzle/sprites.svg', deps);
    const calls: unknown[][] = [];
    const target = {
      drawImage: (...args: unknown[]) => {
        calls.push(args);
      },
    } as unknown as Ctx2D;
    sheet.blit(target, 'germ-2-a', 40, 56);
    const r = SPRITES['germ-2-a'];
    expect(calls[0]?.slice(1)).toEqual([r.x * 2, r.y * 2, r.w * 2, r.h * 2, 40, 56, r.w, r.h]);
  });

  it('rejects when there is no 2D context', async () => {
    const { deps } = makeDeps();
    deps.createSurface = () => ({ width: 0, height: 0, getContext: () => null });
    await expect(rasteriseSheet('/x.svg', deps)).rejects.toThrow('no 2D context');
  });

  it('loadSpriteSheet rasterises once and shares the result', async () => {
    const { deps } = makeDeps();
    const a = await loadSpriteSheet('/puzzle/sprites.svg', deps);
    const b = await loadSpriteSheet('/puzzle/sprites.svg', deps);
    expect(a).not.toBeNull();
    expect(a).toBe(b);
    expect(deps.loadImage).toHaveBeenCalledTimes(1);
  });

  it('loadSpriteSheet resolves to null, not a throw, when the image cannot load', async () => {
    const { deps } = makeDeps();
    deps.loadImage = () => Promise.reject(new Error('404'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await loadSpriteSheet('/missing.svg', deps)).toBeNull();
    warn.mockRestore();
  });
});
