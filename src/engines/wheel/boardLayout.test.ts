import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOARD_ROWS, autoLines, firstRowFor, fitPuzzle, joinLines } from './boardLayout';
import type { BoardCell } from './boardLayout';

const text = (cells: BoardCell[]): string => cells.map((c) => (c.kind === 'blank' ? '.' : c.char)).join('');

describe('board layout', () => {
  it('the board is 12 / 14 / 14 / 12 tiles', () => {
    expect(BOARD_ROWS).toEqual([12, 14, 14, 12]);
    const b = fitPuzzle({ phrase: 'HI' });
    expect(b?.cells.map((r) => r.length)).toEqual([12, 14, 14, 12]);
  });

  it('line placement: 1 line -> row 2, 2 lines -> rows 2-3, 3 -> rows 1-3, 4 -> all four', () => {
    expect([1, 2, 3, 4].map(firstRowFor)).toEqual([1, 1, 0, 0]);
    expect(firstRowFor(0)).toBeNull();
    expect(firstRowFor(5)).toBeNull();
    const rows = (lines: string[]): number[] => {
      const b = fitPuzzle({ phrase: joinLines(lines), lines });
      return b
        ? b.cells.map((r, i) => (r.some((c) => c.kind !== 'blank') ? i : -1)).filter((i) => i >= 0)
        : [];
    };
    expect(rows(['ONE LINE'])).toEqual([1]);
    expect(rows(['TWO', 'LINES'])).toEqual([1, 2]);
    expect(rows(['THREE', 'LINES', 'HERE'])).toEqual([0, 1, 2]);
    expect(rows(['A', 'B', 'C', 'D'])).toEqual([0, 1, 2, 3]);
  });

  it('centres each line in its row', () => {
    const b = fitPuzzle({ phrase: 'HOT CHOCOLATE', lines: ['HOT CHOCOLATE'] });
    expect(text(b?.cells[1] ?? [])).toBe('HOT.CHOCOLATE.');
    const c = fitPuzzle({ phrase: 'BLUE MOON RISING', lines: ['BLUE MOON', 'RISING'] });
    expect(text(c?.cells[1] ?? [])).toBe('..BLUE.MOON...');
    expect(text(c?.cells[2] ?? [])).toBe('....RISING....');
  });

  it('rows of 12 hold 12 characters, rows of 14 hold 14', () => {
    expect(fitPuzzle({ phrase: 'ABCDEFGHIJKLMN' })).not.toBeNull();
    expect(fitPuzzle({ phrase: 'ABCDEFGHIJKLMNO' })).toBeNull();
    const three = ['ABCDEFGHIJKL', 'ABCDEFGHIJKLMN', 'ABCDEFGHIJKL'];
    expect(fitPuzzle({ phrase: joinLines(three), lines: three })).not.toBeNull();
    const tooWideTop = ['ABCDEFGHIJKLM', 'ABCDEFGHIJKL', 'ABC'];
    expect(fitPuzzle({ phrase: joinLines(tooWideTop), lines: tooWideTop })).toBeNull();
    const tooWideBottom = ['ABC', 'ABCDEFGHIJKL', 'ABCDEFGHIJKLM', 'ABCDEFGHIJKLM'];
    expect(fitPuzzle({ phrase: joinLines(tooWideBottom), lines: tooWideBottom })).toBeNull();
  });

  it('a line may end in a hyphen to break a hyphenated word', () => {
    const lines = ['A WELL-', 'DESERVED', 'DAY OFF'];
    expect(joinLines(lines)).toBe('A WELL-DESERVED DAY OFF');
    const b = fitPuzzle({ phrase: 'A WELL-DESERVED DAY OFF', lines });
    expect(b).not.toBeNull();
    expect(b?.cells[0]?.some((c) => c.kind === 'punct' && c.char === '-')).toBe(true);
    expect(b?.lines).toEqual(lines);
  });

  it('a hyphen inside a line is a punctuation tile and a space is a blank tile', () => {
    const b = fitPuzzle({ phrase: 'THANK-YOU NOTE', lines: ['THANK-YOU NOTE'] });
    const row = b?.cells[1] ?? [];
    expect(row.filter((c) => c.kind === 'punct')).toEqual([{ kind: 'punct', char: '-' }]);
    expect(row.filter((c) => c.kind === 'letter')).toHaveLength(12);
  });

  it('rejects lines that do not spell the phrase, empty lines and more than four lines', () => {
    expect(fitPuzzle({ phrase: 'ONE TWO', lines: ['ONE', 'THREE'] })).toBeNull();
    expect(fitPuzzle({ phrase: 'ONE', lines: [''] })).toBeNull();
    expect(fitPuzzle({ phrase: 'A B C D E', lines: ['A', 'B', 'C', 'D', 'E'] })).toBeNull();
    // a missing space after a non-hyphen line end
    expect(fitPuzzle({ phrase: 'ONETWO', lines: ['ONE', 'TWO'] })).toBeNull();
  });

  it('rejects characters the board cannot show', () => {
    expect(fitPuzzle({ phrase: 'CAFE 7' })).toBeNull();
    expect(fitPuzzle({ phrase: 'ONE\nTWO' })).toBeNull();
  });

  it('autoLines: with no lines, a phrase of up to 14 characters goes on one line', () => {
    expect(autoLines('HELLO THERE')).toEqual(['HELLO THERE']);
    expect(autoLines('ABCDEFGHIJKLMN')).toEqual(['ABCDEFGHIJKLMN']);
    expect(autoLines('ABCDEFGHIJKLMNO')).toBeNull();
    expect(autoLines('')).toBeNull();
    const b = fitPuzzle({ phrase: 'HELLO THERE' });
    expect(b?.lines).toEqual(['HELLO THERE']);
    expect(b?.firstRow).toBe(1);
    expect(fitPuzzle({ phrase: 'A PHRASE THAT IS TOO LONG FOR ONE LINE' })).toBeNull();
  });

  it('joinLines puts a space between lines except after a hyphen', () => {
    expect(joinLines(['A', 'B'])).toBe('A B');
    expect(joinLines(['WELL-', 'DONE'])).toBe('WELL-DONE');
  });

  const contentPath = join(process.cwd(), 'src/content/wheel_of_fortune.json');
  it.skipIf(!existsSync(contentPath))(
    'every puzzle in wheel_of_fortune.json fits the 12/14/14/12 board',
    () => {
      const data = JSON.parse(readFileSync(contentPath, 'utf8')) as {
        puzzles: { id: string; phrase: string; lines?: string[] }[];
      };
      const bad = data.puzzles.filter((p) => fitPuzzle(p) === null).map((p) => p.id);
      expect(bad).toEqual([]);
    },
  );
});
