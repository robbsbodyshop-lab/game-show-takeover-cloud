/**
 * The puzzle board: 4 rows of 12 / 14 / 14 / 12 tiles. Rules: docs/WHEEL_OF_FORTUNE_RULES.md,
 * content line rules: docs/reference/CONTENT_SCHEMA_V1.md. One line uses row 2, two lines rows 2-3,
 * three lines rows 1-3, four lines all rows. A line may end in a hyphen to break a hyphenated word.
 */
import { isLetter } from './letters';

export const BOARD_ROWS: readonly number[] = [12, 14, 14, 12];
export const MAX_LINE = 14;

export type BoardCell =
  { kind: 'blank' } | { kind: 'letter'; char: string } | { kind: 'punct'; char: string };

export interface Board {
  /** The lines as placed, upper-case. */
  lines: string[];
  /** Index (0-3) of the row the first line sits on. */
  firstRow: number;
  /** Four rows of cells, lengths 12 / 14 / 14 / 12. */
  cells: BoardCell[][];
}

const PHRASE_CHARS = /^[A-Z '&!?.-]+$/;

/** Index of the first row used by `lineCount` lines (1 line -> row 2 ... 4 lines -> row 1). */
export function firstRowFor(lineCount: number): number | null {
  switch (lineCount) {
    case 1:
      return 1;
    case 2:
      return 1;
    case 3:
      return 0;
    case 4:
      return 0;
    default:
      return null;
  }
}

/** Joins board lines back into the phrase: a trailing hyphen joins without a space. */
export function joinLines(lines: readonly string[]): string {
  let out = '';
  lines.forEach((line, i) => {
    if (i > 0) out += out.endsWith('-') ? '' : ' ';
    out += line;
  });
  return out;
}

/** Fallback when a puzzle has no `lines`: a phrase of up to 14 characters goes on one line. */
export function autoLines(phrase: string): string[] | null {
  const p = phrase.trim();
  return p.length > 0 && p.length <= MAX_LINE ? [p] : null;
}

/**
 * Lays a puzzle out on the board, centred in each row (an odd leftover tile goes on the right).
 * Returns null when the puzzle cannot be placed: more than 4 lines, a line wider than its row,
 * characters the board cannot show, or lines that do not spell the phrase.
 */
export function fitPuzzle(puzzle: { phrase: string; lines?: string[] }): Board | null {
  const phrase = puzzle.phrase.toUpperCase();
  if (!PHRASE_CHARS.test(phrase)) return null;
  const lines = (puzzle.lines ?? autoLines(phrase) ?? []).map((l) => l.toUpperCase());
  const first = firstRowFor(lines.length);
  if (first === null) return null;
  if (joinLines(lines) !== phrase) return null;

  const cells: BoardCell[][] = BOARD_ROWS.map((w) =>
    Array.from({ length: w }, (): BoardCell => ({ kind: 'blank' })),
  );
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const rowIdx = first + i;
    const row = cells[rowIdx];
    const cap = BOARD_ROWS[rowIdx] ?? 0;
    if (!row || line.length === 0 || line.length > cap || line.startsWith(' ') || line.endsWith(' '))
      return null;
    const pad = Math.floor((cap - line.length) / 2);
    for (let c = 0; c < line.length; c++) {
      const ch = line.charAt(c);
      row[pad + c] =
        ch === ' '
          ? { kind: 'blank' }
          : isLetter(ch)
            ? { kind: 'letter', char: ch }
            : { kind: 'punct', char: ch };
    }
  }
  return { lines, firstRow: first, cells };
}
