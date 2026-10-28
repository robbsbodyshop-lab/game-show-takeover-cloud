import { describe, expect, it } from 'vitest';
import { GRAVITY_MS, clearPoints, levelClearBonus, pointsPerGerm } from './scoring';
import type { Speed } from './types';

describe('scoring table', () => {
  const table: [Speed, number, number][] = [
    ['low', 0, 100],
    ['low', 1, 200],
    ['low', 2, 300],
    ['med', 0, 150],
    ['med', 1, 300],
    ['med', 3, 600],
    ['hi', 0, 200],
    ['hi', 1, 400],
    ['hi', 4, 1000],
  ];
  it.each(table)('%s speed, cascade %i -> %i per germ', (speed, cascade, expected) => {
    expect(pointsPerGerm(speed, cascade)).toBe(expected);
  });

  it('multiplies by the number of germs', () => {
    expect(clearPoints(3, 'med', 1)).toBe(900);
    expect(clearPoints(0, 'hi', 0)).toBe(0);
  });

  it('level clear bonus is 1000 x level', () => {
    expect(levelClearBonus(1)).toBe(1000);
    expect(levelClearBonus(7)).toBe(7000);
    expect(levelClearBonus(20)).toBe(20000);
  });

  it('gravity per row is 1000 / 500 / 250 ms', () => {
    expect(GRAVITY_MS).toEqual({ low: 1000, med: 500, hi: 250 });
  });
});
