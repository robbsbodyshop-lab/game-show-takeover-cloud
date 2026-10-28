import { describe, expect, it } from 'vitest';
import {
  callLetter,
  consonantsRemaining,
  createPuzzleState,
  hiddenTileIndices,
  isFullyRevealed,
  lightAll,
  lightNext,
  litCount,
  revealAll,
  revealTile,
  sameLetterBonus,
  vowelsRemaining,
} from './puzzleState';
import type { PuzzleInput } from './types';

const input = (phrase: string, extra: Partial<PuzzleInput> = {}): PuzzleInput => ({
  id: 'p',
  category: 'THING',
  phrase,
  use: ['round'],
  ...extra,
});
const make = (phrase: string, extra: Partial<PuzzleInput> = {}) => {
  const ps = createPuzzleState(input(phrase, extra));
  if (!ps) throw new Error('does not fit');
  return ps;
};

describe('puzzle state', () => {
  it('has one tile per letter, in reading order, with punctuation left out', () => {
    const ps = make("DON'T GO", { lines: ["DON'T", 'GO'] });
    expect(ps.tiles.map((t) => t.char).join('')).toBe('DONTGO');
    const pos = ps.tiles.map((t) => t.row * 100 + t.col);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
  });

  it('createPuzzleState returns null when the puzzle does not fit', () => {
    expect(createPuzzleState(input('A PHRASE THAT IS MUCH TOO LONG FOR ONE LINE'))).toBeNull();
  });

  it('calling a letter reveals every occurrence and queues them in reading order', () => {
    const ps = make('BANANA BREAD');
    const r = callLetter(ps, 'A');
    expect(r.count).toBe(4);
    expect(r.repeat).toBe(false);
    expect(r.state.queue).toEqual(ps.tiles.flatMap((t, i) => (t.char === 'A' ? [i] : [])));
    expect(r.state.called).toEqual(['A']);
    expect(litCount(r.state)).toBe(0);
  });

  it('letters light one at a time in reading order', () => {
    let ps = callLetter(make('BANANA'), 'A').state;
    const order: number[] = [];
    while (ps.queue.length > 0) {
      order.push(ps.queue[0] ?? -1);
      ps = lightNext(ps);
    }
    expect(order).toEqual([1, 3, 5]);
    expect(ps.shown.filter(Boolean)).toHaveLength(3);
    expect(lightNext(ps)).toBe(ps);
  });

  it('lightAll lights everything queued at once', () => {
    const ps = callLetter(make('BANANA'), 'A').state;
    const all = lightAll(ps);
    expect(all.queue).toEqual([]);
    expect(litCount(all)).toBe(3);
    expect(lightAll(all)).toBe(all);
  });

  it('a miss and a repeat reveal nothing; a repeat is flagged', () => {
    const ps = make('CAT');
    const miss = callLetter(ps, 'Z');
    expect(miss.count).toBe(0);
    expect(miss.state.called).toEqual(['Z']);
    const again = callLetter(miss.state, 'Z');
    expect(again.repeat).toBe(true);
    expect(again.state).toBe(miss.state);
  });

  it('counts consonants and vowels remaining (Y is a consonant)', () => {
    let ps = make('HAPPY DAYS');
    expect(consonantsRemaining(ps)).toBe(5); // H, P, Y, D, S
    expect(vowelsRemaining(ps)).toBe(1); // A only: Y is a consonant
    ps = callLetter(ps, 'Y').state;
    expect(consonantsRemaining(ps)).toBe(4);
    expect(vowelsRemaining(ps)).toBe(1);
  });

  it('knows when every vowel or consonant is revealed', () => {
    let ps = make('ADD IT');
    expect(vowelsRemaining(ps)).toBe(2);
    expect(consonantsRemaining(ps)).toBe(2);
    ps = callLetter(callLetter(ps, 'A').state, 'I').state;
    expect(vowelsRemaining(ps)).toBe(0);
    ps = callLetter(callLetter(ps, 'D').state, 'T').state;
    expect(consonantsRemaining(ps)).toBe(0);
    expect(isFullyRevealed(ps)).toBe(true);
  });

  it('isFullyRevealed counts queued tiles as revealed, and false while a letter is hidden', () => {
    const ps = callLetter(make('AA B'), 'A').state;
    expect(isFullyRevealed(ps)).toBe(false);
    expect(isFullyRevealed(callLetter(ps, 'B').state)).toBe(true);
  });

  it('toss-up reveal lights single tiles directly', () => {
    let ps = make('CAT');
    expect(hiddenTileIndices(ps)).toEqual([0, 1, 2]);
    ps = revealTile(ps, 1);
    expect(ps.shown).toEqual([false, true, false]);
    expect(hiddenTileIndices(ps)).toEqual([0, 2]);
    expect(revealTile(ps, 1)).toBe(ps);
    expect(revealAll(ps).shown).toEqual([true, true, true]);
  });

  it('Same Letter bonus: the shared consonant, once, when it is in the puzzle', () => {
    const ps = make('BIG BLUE BEACH BALL', { sameLetter: 'B', lines: ['BIG BLUE', 'BEACH BALL'] });
    expect(sameLetterBonus(ps, 'B')).toBe(true);
    expect(sameLetterBonus(ps, 'L')).toBe(false);
    expect(sameLetterBonus(callLetter(ps, 'B').state, 'B')).toBe(false);
    expect(sameLetterBonus(make('BIG BLUE'), 'B')).toBe(false);
  });
});
