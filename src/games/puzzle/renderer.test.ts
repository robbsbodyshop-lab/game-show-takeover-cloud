import { describe, expect, it } from 'vitest';
import { createPuzzleState, reducePuzzle } from '@/engines/puzzle';
import type { Board, MatchState } from '@/engines/puzzle';
import type { ActiveBurst } from './bursts';
import type { Ctx2D } from './canvasTypes';
import { PIXEL_SCALE } from './layout';
import { capsuleSprite, renderScene } from './renderer';
import { SPRITES } from './sprites';
import type { SpriteId } from './sprites';
import type { SpriteSheet } from './spriteCanvas';

interface Recorded {
  ctx: Ctx2D;
  sprites: { id: SpriteId; x: number; y: number; alpha: number }[];
  texts: string[];
  transforms: number[][];
  clears: number;
}

/** A 2D context that only records, since jsdom has no real canvas. */
const recorder = (): { rec: Recorded; sheet: SpriteSheet } => {
  const rec: Recorded = {
    ctx: undefined as unknown as Ctx2D,
    sprites: [],
    texts: [],
    transforms: [],
    clears: 0,
  };
  let alpha = 1;
  const ctx = {
    fillStyle: '',
    font: '',
    textAlign: 'left',
    textBaseline: 'top',
    imageSmoothingEnabled: true,
    get globalAlpha() {
      return alpha;
    },
    set globalAlpha(v: number) {
      alpha = v;
    },
    fillRect: () => undefined,
    drawImage: () => undefined,
    fillText: (text: string) => {
      rec.texts.push(text);
    },
    save: () => undefined,
    restore: () => undefined,
    setTransform: (...args: number[]) => {
      rec.transforms.push(args);
    },
    clearRect: () => {
      rec.clears += 1;
    },
  };
  rec.ctx = ctx as unknown as Ctx2D;
  const sheet: SpriteSheet = {
    blit: (_c, id, x, y) => {
      rec.sprites.push({ id, x, y, alpha });
    },
  };
  return { rec, sheet };
};

const started = (mode: '1p' | '2p'): MatchState =>
  reducePuzzle(
    reducePuzzle(createPuzzleState(), {
      type: 'NEW_MATCH',
      mode,
      levels: [3, 3],
      speeds: ['low', 'hi'],
      seed: 11,
    }),
    { type: 'START_ROUND' },
  );

const model = (
  match: MatchState,
  extra: Partial<{ animMs: number; bursts: ActiveBurst[]; reducedMotion: boolean }> = {},
) => ({
  match,
  animMs: 0,
  bursts: [] as ActiveBurst[],
  reducedMotion: false,
  ...extra,
});

describe('renderScene', () => {
  it('draws at 2x with smoothing off and clears the canvas first', () => {
    const { rec, sheet } = recorder();
    renderScene(rec.ctx, sheet, model(started('1p')));
    expect(rec.transforms[0]).toEqual([PIXEL_SCALE, 0, 0, PIXEL_SCALE, 0, 0]);
    expect(rec.ctx.imageSmoothingEnabled).toBe(false);
    expect(rec.clears).toBe(1);
  });

  it('draws the flask, every germ, the active capsule and the next preview in 1P', () => {
    const match = started('1p');
    const { rec, sheet } = recorder();
    renderScene(rec.ctx, sheet, model(match));
    const ids = rec.sprites.map((s) => s.id);
    expect(ids.filter((id) => id === 'flask-frame-1p')).toHaveLength(1);
    expect(ids).not.toContain('flask-frame-2p');
    const germs = ids.filter((id) => id.startsWith('germ-')).length;
    expect(germs).toBe(match.players[0]?.germsLeft);
    // two halves of the live capsule plus two for the next preview
    expect(ids.filter((id) => id.startsWith('capsule-half-')).length).toBe(4);
    for (const s of rec.sprites) expect(SPRITES[s.id], s.id).toBeDefined();
  });

  it('puts the player 1 and player 2 flasks side by side in 2P', () => {
    const { rec, sheet } = recorder();
    renderScene(rec.ctx, sheet, model(started('2p')));
    const flasks = rec.sprites.filter((s) => s.id.startsWith('flask-frame'));
    expect(flasks.map((s) => s.id)).toEqual(['flask-frame-1p', 'flask-frame-2p']);
    const [a, b] = flasks;
    expect(a && b && a.x < b.x && a.y === b.y).toBe(true);
  });

  it('writes the HUD: score, germs, level, speed and the round line', () => {
    const { rec, sheet } = recorder();
    renderScene(rec.ctx, sheet, model(started('2p')));
    expect(rec.texts).toContain('SCORE 000000');
    expect(rec.texts.some((t) => t.startsWith('GERMS '))).toBe(true);
    expect(rec.texts).toContain('LEVEL 03');
    expect(rec.texts).toContain('SPEED LOW');
    expect(rec.texts).toContain('SPEED HI');
    expect(rec.texts).toContain('ROUND 1');
    expect(rec.texts).toContain('P1');
    expect(rec.texts).toContain('P2');
  });

  it('shows one crown per round won, the rest dimmed', () => {
    const match = { ...started('2p'), roundWins: [2, 0] };
    const { rec, sheet } = recorder();
    renderScene(rec.ctx, sheet, model(match));
    const crowns = rec.sprites.filter((s) => s.id === 'crown');
    expect(crowns).toHaveLength(6);
    const p1 = crowns.slice(0, 3).map((c) => c.alpha);
    expect(p1).toEqual([1, 1, 0.25]);
    expect(crowns.slice(3).every((c) => c.alpha === 0.25)).toBe(true);
  });

  it('wiggles germs between frames a and b every 500 ms, and holds frame a for reduced motion', () => {
    const match = started('1p');
    const frameOf = (animMs: number, reducedMotion = false): Set<string> => {
      const { rec, sheet } = recorder();
      renderScene(rec.ctx, sheet, model(match, { animMs, reducedMotion }));
      return new Set(rec.sprites.filter((s) => s.id.startsWith('germ-')).map((s) => s.id.slice(-1)));
    };
    const early = frameOf(0);
    const later = frameOf(500);
    expect([...early].sort()).not.toEqual([...later].sort());
    expect(frameOf(1000)).toEqual(early);
    expect([...frameOf(500, true)].every((f) => f === 'a')).toBe(true);
  });

  it('draws clear bursts over their cells (germ flash on the first frame)', () => {
    const match = started('1p');
    const bursts: ActiveBurst[] = [
      { player: 0, row: 14, col: 2, color: 1, germ: true, startMs: 0, frame: 1 },
      { player: 0, row: 14, col: 3, color: 3, germ: false, startMs: 0, frame: 4 },
    ];
    const { rec, sheet } = recorder();
    renderScene(rec.ctx, sheet, model(match, { bursts }));
    const ids = rec.sprites.map((s) => s.id);
    expect(ids).toContain('germ-1-hit');
    expect(ids).toContain('clear-burst-1-f1');
    expect(ids).toContain('clear-burst-3-f4');
  });

  it('draws one warning pip per queued garbage half (blinking, capped at 8)', () => {
    const base = started('2p');
    const queued = {
      ...base,
      players: base.players.map((p, i) =>
        i === 1 ? { ...p, pendingGarbage: [1, 2, 3] as (1 | 2 | 3)[] } : p,
      ),
    };
    const pips = (animMs: number): number => {
      const { rec, sheet } = recorder();
      renderScene(rec.ctx, sheet, model(queued, { animMs }));
      return rec.sprites.filter((s) => s.id === 'garbage-warning-pip').length;
    };
    expect(pips(0)).toBe(3);
    expect(pips(250)).toBe(0);
    expect(pips(500)).toBe(3);
  });

  it('draws locked halves with the sprite that faces away from their partner', () => {
    expect(capsuleSprite(1, 'right')).toBe('capsule-half-1-left');
    expect(capsuleSprite(2, 'left')).toBe('capsule-half-2-right');
    expect(capsuleSprite(3, 'down')).toBe('capsule-half-3-top');
    expect(capsuleSprite(1, 'up')).toBe('capsule-half-1-bottom');
    expect(capsuleSprite(2, null)).toBe('capsule-half-2-lone');
  });

  it('draws a board cell where the engine says there is one', () => {
    const base = started('1p');
    const player = base.players[0];
    if (!player) throw new Error('no player');
    const board: Board = player.board.map((row) => row.map((cell) => ({ ...cell })));
    const line = board[15];
    if (line) line[0] = { kind: 'half', color: 2, partnerDir: null };
    const match = { ...base, players: [{ ...player, board }] };
    const { rec, sheet } = recorder();
    renderScene(rec.ctx, sheet, model(match));
    expect(rec.sprites.some((s) => s.id === 'capsule-half-2-lone')).toBe(true);
  });
});
