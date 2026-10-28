import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = import.meta.dirname;
const sheets = readdirSync(dir)
  .filter((f) => f.endsWith('.css'))
  .map((f) => [f, readFileSync(path.join(dir, f), 'utf8')] as const);

describe('Wheel stylesheets (docs/DESIGN.md)', () => {
  it('has stylesheets to check', () => {
    expect(sheets.length).toBeGreaterThan(10);
  });

  it.each(sheets)('%s: no gradients, no raw hex colours, no rounded corners, no easing', (_file, css) => {
    expect(css).not.toMatch(/gradient\(/i);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/border-radius\s*:\s*[1-9]/);
    expect(css).not.toMatch(/\b(ease|ease-in|ease-out|ease-in-out|cubic-bezier|linear)\b/);
  });

  it.each(sheets)('%s: no text under 16 px (audience text is 18 px or more)', (_file, css) => {
    for (const m of css.matchAll(/font-size:\s*(\d+)px/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(16);
  });

  it.each(sheets)('%s: every animation steps', (_file, css) => {
    for (const m of css.matchAll(/animation:\s*([^;]+);/g)) expect(m[1]).toMatch(/steps\(|^none$/);
  });
});
