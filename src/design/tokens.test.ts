import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const dir = import.meta.dirname;
const styleSheets = Object.fromEntries(
  readdirSync(dir)
    .filter((file) => file.endsWith('.css'))
    .map((file) => [file, readFileSync(path.join(dir, file), 'utf8')]),
);
const tokensCss = styleSheets['tokens.css'] ?? '';

const palette = (): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const match of tokensCss.matchAll(/--c-([a-z]+):\s*(#[0-9a-fA-F]{6});/g)) {
    const [, name, hex] = match;
    if (name && hex) out[name] = hex;
  }
  return out;
};

const luminance = (hex: string): number => {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
};

describe('tokens.css', () => {
  it('defines the full palette with the agreed hex values', () => {
    expect(palette()).toEqual({
      gold: '#ffd23f',
      mustard: '#fff07a',
      bulb: '#ffffb0',
      orange: '#ff7a1f',
      rust: '#e23b4a',
      avocado: '#3dc24f',
      olive: '#9bea5c',
      teal: '#2f6fe8',
      aqua: '#5fe0ff',
      cream: '#fff6dc',
      mist: '#b7bdff',
      deep: '#4b39b8',
      lagoon: '#2b1f72',
      night: '#12093a',
      ink: '#0b0620',
      walnut: '#8a5a2b',
      plum: '#a845d8',
      mauve: '#eba6ff',
      coral: '#ff7c7c',
      shade: '#1a0f52',
    });
  });

  it('keeps body and label text at WCAG AA (4.5:1) on its surface', () => {
    const p = palette();
    const pairs: [string, string][] = [
      ['cream', 'lagoon'],
      ['cream', 'night'],
      ['gold', 'lagoon'],
      ['gold', 'ink'],
      ['mist', 'lagoon'],
      ['mist', 'night'],
      ['mustard', 'lagoon'],
      ['olive', 'lagoon'],
      ['aqua', 'lagoon'],
      ['coral', 'lagoon'],
      ['mauve', 'lagoon'],
      ['mist', 'deep'],
      ['cream', 'deep'],
      ['bulb', 'night'],
      ['ink', 'orange'],
      ['ink', 'gold'],
      ['ink', 'avocado'],
      ['ink', 'rust'],
      ['ink', 'cream'],
      ['ink', 'aqua'],
      ['ink', 'mauve'],
    ];
    for (const [fg, bg] of pairs) {
      expect(contrast(p[fg] ?? '', p[bg] ?? ''), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps bold large button text (18.66px+) at AA-large (3:1) on teal and plum', () => {
    const p = palette();
    expect(contrast(p.ink ?? '', p.teal ?? '')).toBeGreaterThanOrEqual(3);
    expect(contrast(p.ink ?? '', p.plum ?? '')).toBeGreaterThanOrEqual(3);
  });

  it('keeps the focus ring visible on panels and the backdrop', () => {
    const p = palette();
    expect(contrast(p.bulb ?? '', p.lagoon ?? '')).toBeGreaterThanOrEqual(3);
    expect(contrast(p.bulb ?? '', p.night ?? '')).toBeGreaterThanOrEqual(3);
  });
});

describe('design stylesheets', () => {
  it('never use a gradient (dither is an SVG tile)', () => {
    for (const [file, css] of Object.entries(styleSheets)) {
      expect(css, file).not.toMatch(/gradient\(/);
    }
  });

  it('never round a corner except the CRT overlay', () => {
    for (const [file, css] of Object.entries(styleSheets)) {
      const rounded = css.split('\n').filter((line) => /border-radius:\s*[1-9]/.test(line));
      expect(rounded.length, file).toBe(file.endsWith('global.css') ? 1 : 0);
    }
  });
});
