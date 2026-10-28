import { describe, expect, it } from 'vitest';
import { STAGE_HEIGHT, STAGE_WIDTH } from '@/design';
import { BOARD_H, BOARD_W, DISPLAY_SCALE, FLASK_H, FLASK_W, PIXEL_SCALE, SCENE_1P, SCENE_2P } from './layout';

describe('layout', () => {
  it('draws at 2x and fits the 1920x1080 stage in both modes', () => {
    expect(PIXEL_SCALE).toBe(2);
    for (const scene of [SCENE_1P, SCENE_2P]) {
      expect(scene.width * DISPLAY_SCALE).toBeLessThanOrEqual(STAGE_WIDTH);
      expect(scene.height * DISPLAY_SCALE).toBeLessThanOrEqual(STAGE_HEIGHT);
    }
  });

  it('holds an 8x16 board of 16 px cells inside each flask', () => {
    expect(BOARD_W).toBe(128);
    expect(BOARD_H).toBe(256);
    expect(FLASK_W).toBeGreaterThan(BOARD_W);
    expect(FLASK_H).toBeGreaterThan(BOARD_H);
  });

  it('keeps the 2P flasks and the centre panel from overlapping', () => {
    const [left, right] = SCENE_2P.flasks;
    expect(left && right && left.x + FLASK_W < right.x).toBe(true);
    expect(right && right.x + FLASK_W <= SCENE_2P.width).toBe(true);
  });
});
