/**
 * Draws the whole puzzle scene (flasks, boards, capsules, germs, bursts, pips and HUD) into a 2D
 * context. Pure drawing: it reads the match state and animation clock and changes nothing.
 * Coordinates are logical pixels; the caller's canvas is `PIXEL_SCALE` times larger.
 */
import { ROUNDS_TO_WIN, boardView, hud } from '@/engines/puzzle';
import type { CellView, Color, Hud, MatchState, Speed } from '@/engines/puzzle';
import type { ActiveBurst } from './bursts';
import type { Ctx2D } from './canvasTypes';
import {
  BOARD_X,
  BOARD_Y,
  CELL,
  FLASK_H,
  FLASK_W,
  NECK_INNER_H,
  NECK_INNER_W,
  NECK_INNER_X,
  NECK_INNER_Y,
  PIXEL_SCALE,
  TOP_STRIP,
  sceneFor,
} from './layout';
import type { SceneLayout } from './layout';
import type { SpriteId } from './sprites';
import type { SpriteSheet } from './spriteCanvas';

export const WIGGLE_MS = 500;
const PIP_BLINK_MS = 250;
const MAX_PIPS = 8;

/** Palette for canvas text and panels (same values as `design/tokens.css`; canvas cannot read CSS vars). */
const C = {
  ink: '#0B0620',
  night: '#12093A',
  lagoon: '#2B1F72',
  deep: '#4B39B8',
  shade: '#1A0F52',
  gold: '#FFD23F',
  aqua: '#5FE0FF',
  cream: '#FFF6DC',
  mist: '#B7BDFF',
} as const;

const FONT = "8px Silkscreen, 'Courier New', monospace";
const SPEED_LABEL: Record<Speed, string> = { low: 'LOW', med: 'MED', hi: 'HI' };
const SPEED_INDEX: Record<Speed, number> = { low: 0, med: 1, hi: 2 };

export interface RenderModel {
  match: MatchState;
  /** Animation clock in ms; stops while the game is locked or paused-by-host. */
  animMs: number;
  bursts: readonly ActiveBurst[];
  reducedMotion: boolean;
}

type PartnerDir = 'up' | 'down' | 'left' | 'right' | null;

const SHAPE_FOR_PARTNER = { right: 'left', left: 'right', down: 'top', up: 'bottom' } as const;

/** Which sprite a capsule half uses: the half sits on the opposite side from its partner. */
export const capsuleSprite = (color: Color, partnerDir: PartnerDir): SpriteId => {
  const shape = partnerDir === null ? 'lone' : SHAPE_FOR_PARTNER[partnerDir];
  return `capsule-half-${color.toString()}-${shape}` as SpriteId;
};

const spriteForCell = (cell: CellView, germFrame: 'a' | 'b'): SpriteId | null => {
  if (cell.kind === 'empty') return null;
  if (cell.kind === 'germ') return `germ-${cell.color.toString()}-${germFrame}` as SpriteId;
  return capsuleSprite(cell.color, cell.partnerDir);
};

const text = (
  ctx: Ctx2D,
  value: string,
  x: number,
  y: number,
  colour: string = C.cream,
  align: 'left' | 'center' | 'right' = 'left',
): void => {
  ctx.textAlign = align;
  ctx.fillStyle = C.ink;
  ctx.fillText(value, x + 1, y + 1);
  ctx.fillStyle = colour;
  ctx.fillText(value, x, y);
};

const panel = (ctx: Ctx2D, x: number, y: number, w: number, h: number): void => {
  ctx.fillStyle = C.ink;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = C.lagoon;
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  ctx.fillStyle = C.deep;
  ctx.fillRect(x + 2, y + 2, w - 4, 1);
  ctx.fillRect(x + 2, y + 2, 1, h - 4);
  ctx.fillStyle = C.shade;
  ctx.fillRect(x + 2, y + h - 3, w - 4, 1);
  ctx.fillRect(x + w - 3, y + 2, 1, h - 4);
};

const bar = (ctx: Ctx2D, x: number, y: number, w: number): void => {
  ctx.fillStyle = C.ink;
  ctx.fillRect(x, y, w, 3);
  ctx.fillStyle = C.mist;
  ctx.fillRect(x + 1, y + 1, w - 2, 1);
};

const playerColour = (index: number): string => (index === 0 ? C.gold : C.aqua);
const flaskSprite = (index: number): SpriteId => (index === 0 ? 'flask-frame-1p' : 'flask-frame-2p');

const drawBoard = (
  ctx: Ctx2D,
  sheet: SpriteSheet,
  match: MatchState,
  index: number,
  fx: number,
  fy: number,
  model: RenderModel,
): void => {
  const player = match.players[index];
  if (!player) return;
  sheet.blit(ctx, flaskSprite(index), fx, fy);
  const phase = model.reducedMotion ? 0 : Math.floor(model.animMs / WIGGLE_MS);
  const view = boardView(player);
  view.forEach((line, row) => {
    line.forEach((cell, col) => {
      const frame = (phase + (cell.kind === 'germ' ? cell.color : 0)) % 2 === 0 ? 'a' : 'b';
      const id = spriteForCell(cell, frame);
      if (id) sheet.blit(ctx, id, fx + BOARD_X + col * CELL, fy + BOARD_Y + row * CELL);
    });
  });
  for (const burst of model.bursts) {
    if (burst.player !== index) continue;
    const x = fx + BOARD_X + burst.col * CELL;
    const y = fy + BOARD_Y + burst.row * CELL;
    if (burst.germ && burst.frame === 1)
      sheet.blit(ctx, `germ-${burst.color.toString()}-hit` as SpriteId, x, y);
    const frame = model.reducedMotion ? 2 : burst.frame;
    sheet.blit(ctx, `clear-burst-${burst.color.toString()}-f${frame.toString()}` as SpriteId, x, y);
  }
  // Next capsule, shown in the neck.
  const next = player.next;
  const nx = fx + NECK_INNER_X + (NECK_INNER_W - 2 * CELL) / 2;
  const ny = fy + NECK_INNER_Y + (NECK_INNER_H - CELL) / 2;
  sheet.blit(ctx, `capsule-half-${next[0].toString()}-left` as SpriteId, nx, ny);
  sheet.blit(ctx, `capsule-half-${next[1].toString()}-right` as SpriteId, nx + CELL, ny);
};

const drawStrips = (
  ctx: Ctx2D,
  sheet: SpriteSheet,
  index: number,
  stats: Hud,
  fx: number,
  fy: number,
  model: RenderModel,
): void => {
  const colour = playerColour(index);
  text(ctx, `P${(index + 1).toString()}`, fx + 2, fy - TOP_STRIP + 4, colour);
  // Garbage warning pips: one per queued half, blinking.
  const pips = Math.min(MAX_PIPS, stats.pendingGarbage);
  const on = model.reducedMotion || Math.floor(model.animMs / PIP_BLINK_MS) % 2 === 0;
  if (on)
    for (let i = 0; i < pips; i++)
      sheet.blit(ctx, 'garbage-warning-pip', fx + FLASK_W - 10 - i * 10, fy - 11);
  const sy = fy + FLASK_H + 4;
  text(ctx, `SCORE ${stats.score.toString().padStart(6, '0')}`, fx + 2, sy, C.gold);
  text(ctx, `GERMS ${stats.germsLeft.toString().padStart(2, '0')}`, fx + 2, sy + 11, C.cream);
};

/** Level and speed read-outs with the selection markers on their scales. */
const drawMeters = (
  ctx: Ctx2D,
  sheet: SpriteSheet,
  index: number,
  stats: Hud,
  x: number,
  y: number,
  w: number,
): number => {
  text(ctx, `LEVEL ${stats.level.toString().padStart(2, '0')}`, x, y, C.cream);
  const lvlY = y + 18;
  bar(ctx, x, lvlY, w);
  const markerW = 14;
  const lx = x + Math.round(((stats.level - 1) / 19) * (w - markerW));
  sheet.blit(ctx, index === 0 ? 'marker-level-p1' : 'marker-level-p2', lx, index === 0 ? lvlY - 7 : lvlY + 2);
  const spY = y + 38;
  text(ctx, `SPEED ${SPEED_LABEL[stats.speed]}`, x, spY, C.cream);
  const barY = spY + 18;
  bar(ctx, x, barY, w);
  const spW = 24;
  const sx = x + Math.round((SPEED_INDEX[stats.speed] / 2) * (w - spW));
  sheet.blit(ctx, index === 0 ? 'marker-speed-p1' : 'marker-speed-p2', sx, index === 0 ? barY - 7 : barY + 2);
  return barY + 12;
};

const drawCrowns = (ctx: Ctx2D, sheet: SpriteSheet, wins: number, x: number, y: number): void => {
  for (let i = 0; i < ROUNDS_TO_WIN; i++) {
    ctx.globalAlpha = i < wins ? 1 : 0.25;
    sheet.blit(ctx, 'crown', x + i * 18, y);
  }
  ctx.globalAlpha = 1;
};

const draw1pHud = (
  ctx: Ctx2D,
  sheet: SpriteSheet,
  match: MatchState,
  scene: SceneLayout,
  stats: Hud,
): void => {
  const flask = scene.flasks[0];
  if (!flask) return;
  const lx = 8;
  const w = 80;
  panel(ctx, lx, flask.y + 24, w + 8, 112);
  drawMeters(ctx, sheet, 0, stats, lx + 8, flask.y + 36, w - 8);
  const rx = flask.x + FLASK_W + 8;
  panel(ctx, rx, flask.y + 24, w + 8, 96);
  text(ctx, 'CLEARED', rx + 8, flask.y + 36, C.mist);
  const cleared = match.roundWins[0] ?? 0;
  sheet.blit(ctx, 'crown', rx + 8, flask.y + 50);
  text(ctx, `x ${cleared.toString()}`, rx + 30, flask.y + 54, C.gold);
  text(ctx, 'ROUND', rx + 8, flask.y + 76, C.mist);
  text(ctx, match.round.toString(), rx + 8, flask.y + 90, C.cream);
};

const draw2pHud = (
  ctx: Ctx2D,
  sheet: SpriteSheet,
  match: MatchState,
  scene: SceneLayout,
  stats: Hud[],
): void => {
  const left = scene.flasks[0];
  const right = scene.flasks[1];
  if (!left || !right) return;
  const x = left.x + FLASK_W + 8;
  const w = right.x - 8 - x;
  panel(ctx, x, left.y + 24, w, 250);
  text(ctx, `ROUND ${match.round.toString()}`, x + w / 2, left.y + 34, C.cream, 'center');
  text(ctx, `FIRST TO ${ROUNDS_TO_WIN.toString()}`, x + w / 2, left.y + 46, C.mist, 'center');
  stats.forEach((s, i) => {
    const top = left.y + 62 + i * 108;
    text(ctx, `P${(i + 1).toString()}`, x + 8, top, playerColour(i));
    drawCrowns(ctx, sheet, match.roundWins[i] ?? 0, x + w - 8 - ROUNDS_TO_WIN * 18 + 2, top - 5);
    drawMeters(ctx, sheet, i, s, x + 8, top + 14, w - 16);
  });
};

/** Draw one frame. Assumes the context is already scaled by `PIXEL_SCALE` and cleared by this call. */
export const renderScene = (ctx: Ctx2D, sheet: SpriteSheet, model: RenderModel): void => {
  const { match } = model;
  const scene = sceneFor(match.players.length);
  ctx.save();
  ctx.setTransform(PIXEL_SCALE, 0, 0, PIXEL_SCALE, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  ctx.font = FONT;
  ctx.textBaseline = 'top';
  ctx.clearRect(0, 0, scene.width, scene.height);
  const stats = match.players.map((p) => hud(p));
  match.players.forEach((_, i) => {
    const flask = scene.flasks[i];
    const s = stats[i];
    if (!flask || !s) return;
    drawBoard(ctx, sheet, match, i, flask.x, flask.y, model);
    drawStrips(ctx, sheet, i, s, flask.x, flask.y, model);
  });
  const first = stats[0];
  if (match.players.length === 1 && first) draw1pHud(ctx, sheet, match, scene, first);
  else if (match.players.length >= 2) draw2pHud(ctx, sheet, match, scene, stats);
  ctx.restore();
};
