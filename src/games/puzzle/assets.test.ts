import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildArt } from './art';
import { packSprites } from './art/sheet';
import { buildSheet } from './tools/buildSprites';
import { SHEET_HEIGHT, SHEET_WIDTH, SPRITES } from './sprites';

const root = process.cwd();
const svgPath = join(root, 'public', 'puzzle', 'sprites.svg');

const REQUIRED = [
  ...[1, 2, 3].flatMap((c) =>
    ['lone', 'left', 'right', 'top', 'bottom'].map((s) => `capsule-half-${c.toString()}-${s}`),
  ),
  ...[1, 2, 3].flatMap((c) => ['a', 'b', 'hit'].map((f) => `germ-${c.toString()}-${f}`)),
  ...[1, 2, 3].flatMap((c) => [1, 2, 3, 4].map((f) => `clear-burst-${c.toString()}-f${f.toString()}`)),
  'flask-frame-1p',
  'flask-frame-2p',
  'crown',
  'marker-level-p1',
  'marker-level-p2',
  'marker-speed-p1',
  'marker-speed-p2',
  'cursor-heart',
  'garbage-warning-pip',
];

describe('sprite sheet', () => {
  it('exists on disk and is not empty', () => {
    expect(existsSync(svgPath)).toBe(true);
    expect(statSync(svgPath).size).toBeGreaterThan(1000);
  });

  it('has every sprite the renderer and menus need', () => {
    for (const id of REQUIRED) expect(Object.keys(SPRITES), id).toContain(id);
    expect(Object.keys(SPRITES)).toHaveLength(REQUIRED.length);
  });

  it('defines a symbol and a placement for every sprite', () => {
    const svg = readFileSync(svgPath, 'utf8');
    for (const id of Object.keys(SPRITES)) {
      expect(svg, id).toContain(`<symbol id="${id}" `);
      expect(svg, id).toContain(`<use href="#${id}" `);
    }
    expect(svg).toContain('shape-rendering="crispEdges"');
  });

  it('is in sync with the procedural art (run tools/buildSprites.ts after changing it)', () => {
    const { svg } = buildSheet();
    expect(readFileSync(svgPath, 'utf8')).toBe(svg);
    const packed = packSprites(buildArt());
    expect(packed.width).toBe(SHEET_WIDTH);
    expect(packed.height).toBe(SHEET_HEIGHT);
    for (const p of packed.placements) {
      expect(SPRITES[p.id as keyof typeof SPRITES], p.id).toEqual({ x: p.x, y: p.y, w: p.w, h: p.h });
    }
  });

  it('keeps every rect inside the sheet and none overlapping', () => {
    const rects = Object.entries(SPRITES);
    for (const [id, r] of rects) {
      expect(r.x, id).toBeGreaterThanOrEqual(0);
      expect(r.y, id).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w, id).toBeLessThanOrEqual(SHEET_WIDTH);
      expect(r.y + r.h, id).toBeLessThanOrEqual(SHEET_HEIGHT);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]?.[1];
        const b = rects[j]?.[1];
        if (!a || !b) continue;
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart, `${rects[i]?.[0] ?? ''} overlaps ${rects[j]?.[0] ?? ''}`).toBe(true);
      }
    }
  });

  it('draws three distinct germ shapes and animation frames', () => {
    const art = new Map(buildArt().map((s) => [s.id, s.pixels.map((p) => p ?? '-').join('')]));
    const sig = (id: string): string => art.get(id) ?? '';
    for (const c of [1, 2, 3]) {
      expect(sig(`germ-${c.toString()}-a`)).not.toBe(sig(`germ-${c.toString()}-b`));
      expect(sig(`germ-${c.toString()}-a`)).not.toBe(sig(`germ-${c.toString()}-hit`));
    }
    expect(sig('germ-1-a')).not.toBe(sig('germ-2-a'));
    expect(sig('germ-2-a')).not.toBe(sig('germ-3-a'));
    expect(sig('germ-1-a')).not.toBe(sig('germ-3-a'));
  });

  it('uses the palette tones: ember, sun and tide', () => {
    const svg = readFileSync(svgPath, 'utf8').toLowerCase();
    for (const hex of ['#e23b4a', '#ffd23f', '#5fe0ff', '#0b0620']) expect(svg).toContain(hex);
  });
});

describe('original assets only', () => {
  // Built from pieces so this file does not trip its own scan.
  const banned = [
    ['mar', 'io'],
    ['nint', 'endo'],
    ['vir', 'us'],
    ['pi', 'll'],
  ].map((p) => p.join(''));

  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
    );

  it('names nothing that belongs to someone else, in any file under src/games/puzzle or public/puzzle', () => {
    const files = [...walk(join(root, 'src', 'games', 'puzzle')), ...walk(join(root, 'public', 'puzzle'))];
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const haystack = `${file}\n${readFileSync(file, 'utf8')}`.toLowerCase();
      for (const word of banned) expect(haystack.includes(word), `${word} in ${file}`).toBe(false);
    }
  });
});
