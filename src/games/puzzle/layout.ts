/**
 * Logical-pixel layout of the puzzle scene. Everything is authored on a 1x grid and drawn at
 * `PIXEL_SCALE` (2x) into the canvas; CSS then scales the canvas to the stage with pixelated filtering.
 */
import { COLS, ROWS } from '../../engines/puzzle/types.ts';

export const PIXEL_SCALE = 2;
export const CELL = 16;
export const BOARD_W = COLS * CELL; // 128
export const BOARD_H = ROWS * CELL; // 256

/** Flask frame: 8 px glass walls, a neck above the board holding the next capsule. */
export const WALL = 8;
export const NECK_H = 32;
export const FLASK_W = BOARD_W + WALL * 2; // 144
export const FLASK_H = NECK_H + BOARD_H + WALL; // 296
export const BOARD_X = WALL;
export const BOARD_Y = NECK_H;
/** Inner neck window, where the next capsule is shown. */
export const NECK_INNER_X = 52;
export const NECK_INNER_W = 40;
export const NECK_INNER_Y = WALL;
export const NECK_INNER_H = NECK_H - WALL;

/** Strip above each flask for the player tag and garbage pips, and below it for the score line. */
export const TOP_STRIP = 14;
export const BOTTOM_STRIP = 24;

export interface SceneLayout {
  width: number;
  height: number;
  /** Top-left of each player's flask frame. */
  flasks: { x: number; y: number }[];
}

const SCENE_H = TOP_STRIP + FLASK_H + 2 + BOTTOM_STRIP;

export const SCENE_1P: SceneLayout = {
  width: 352,
  height: SCENE_H,
  flasks: [{ x: 104, y: TOP_STRIP }],
};

export const SCENE_2P: SceneLayout = {
  width: 464,
  height: SCENE_H,
  flasks: [
    { x: 8, y: TOP_STRIP },
    { x: 312, y: TOP_STRIP },
  ],
};

export const sceneFor = (players: number): SceneLayout => (players >= 2 ? SCENE_2P : SCENE_1P);

/** CSS pixels per logical pixel when the canvas is shown on the 1920x1080 stage. */
export const DISPLAY_SCALE = 3;
