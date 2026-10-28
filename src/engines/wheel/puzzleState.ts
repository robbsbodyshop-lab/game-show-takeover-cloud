/**
 * Puzzle board state: tiles, called letters, revealed letters and the lighting queue.
 * Pure helpers; the engine embeds a PuzzleState in its own state. Rules: docs/WHEEL_OF_FORTUNE_RULES.md
 * ("A turn", "Toss-ups", Same Letter).
 *
 * A letter called correctly is *revealed* at once (it pays at once, it can end the "every consonant
 * is revealed" checks), but its tiles *light* one at a time in reading order from `queue`.
 * Toss-up tiles skip the queue and light directly.
 */
import { fitPuzzle } from './boardLayout';
import type { Board } from './boardLayout';
import { CONSONANTS, VOWELS } from './letters';
import type { PuzzleInput } from './types';

export interface LetterTile {
  row: number;
  col: number;
  char: string;
}

export interface PuzzleState {
  puzzle: PuzzleInput;
  board: Board;
  /** Letter tiles in reading order (row by row, left to right). */
  tiles: LetterTile[];
  /** Every letter called so far, hits and misses, in order. */
  called: string[];
  /** Tile index -> lit (visible to the audience). */
  shown: boolean[];
  /** Tile indices revealed by a call but not lit yet, in reading order. */
  queue: number[];
}

export function createPuzzleState(puzzle: PuzzleInput): PuzzleState | null {
  const board = fitPuzzle(puzzle);
  if (!board) return null;
  const tiles: LetterTile[] = [];
  for (const [r, row] of board.cells.entries()) {
    for (const [c, cell] of row.entries()) {
      if (cell.kind === 'letter') tiles.push({ row: r, col: c, char: cell.char });
    }
  }
  return {
    puzzle: { ...puzzle, phrase: puzzle.phrase.toUpperCase() },
    board,
    tiles,
    called: [],
    shown: tiles.map(() => false),
    queue: [],
  };
}

export function tileIndicesOf(ps: PuzzleState, letter: string): number[] {
  const out: number[] = [];
  ps.tiles.forEach((t, i) => {
    if (t.char === letter) out.push(i);
  });
  return out;
}

export function hasLetter(ps: PuzzleState, letter: string): boolean {
  return ps.tiles.some((t) => t.char === letter);
}

export function isCalled(ps: PuzzleState, letter: string): boolean {
  return ps.called.includes(letter);
}

export interface CallResult {
  state: PuzzleState;
  /** Tiles revealed by this call (0 for a miss or a repeat). */
  count: number;
  repeat: boolean;
}

/** Calls a letter: every occurrence is revealed and queued to light in reading order. */
export function callLetter(ps: PuzzleState, letter: string): CallResult {
  if (ps.called.includes(letter)) return { state: ps, count: 0, repeat: true };
  const hits = tileIndicesOf(ps, letter).filter((i) => !ps.shown[i] && !ps.queue.includes(i));
  return {
    state: { ...ps, called: [...ps.called, letter], queue: [...ps.queue, ...hits] },
    count: hits.length,
    repeat: false,
  };
}

/** Calls several letters at once (the Bonus Round's RSTLNE); their tiles light in reading order together. */
export function callLetters(ps: PuzzleState, letters: readonly string[]): PuzzleState {
  let out = ps;
  for (const l of letters) out = callLetter(out, l).state;
  return { ...out, queue: [...out.queue].sort((a, b) => a - b) };
}

function remaining(ps: PuzzleState, pool: readonly string[]): number {
  const present = new Set(ps.tiles.map((t) => t.char));
  return pool.filter((l) => present.has(l) && !ps.called.includes(l)).length;
}

/** Distinct consonants in the puzzle that have not been called. */
export function consonantsRemaining(ps: PuzzleState): number {
  return remaining(ps, CONSONANTS);
}

/** Distinct vowels in the puzzle that have not been called. */
export function vowelsRemaining(ps: PuzzleState): number {
  return remaining(ps, VOWELS);
}

export function isTileRevealed(ps: PuzzleState, index: number): boolean {
  return ps.shown[index] === true || ps.queue.includes(index);
}

export function isFullyRevealed(ps: PuzzleState): boolean {
  return ps.tiles.every((_, i) => isTileRevealed(ps, i));
}

export function litCount(ps: PuzzleState): number {
  return ps.shown.filter(Boolean).length;
}

/** Tiles neither lit nor queued: the pool for a toss-up's random reveal. */
export function hiddenTileIndices(ps: PuzzleState): number[] {
  const out: number[] = [];
  ps.tiles.forEach((_, i) => {
    if (!isTileRevealed(ps, i)) out.push(i);
  });
  return out;
}

/** Lights one hidden tile straight away (toss-ups). */
export function revealTile(ps: PuzzleState, index: number): PuzzleState {
  if (index < 0 || index >= ps.tiles.length || isTileRevealed(ps, index)) return ps;
  const shown = ps.shown.slice();
  shown[index] = true;
  return { ...ps, shown };
}

/** Lights the next queued tile; returns the same object when the queue is empty. */
export function lightNext(ps: PuzzleState): PuzzleState {
  const [first, ...rest] = ps.queue;
  if (first === undefined) return ps;
  const shown = ps.shown.slice();
  shown[first] = true;
  return { ...ps, shown, queue: rest };
}

export function lightAll(ps: PuzzleState): PuzzleState {
  if (ps.queue.length === 0) return ps;
  const shown = ps.shown.slice();
  ps.queue.forEach((i) => {
    shown[i] = true;
  });
  return { ...ps, shown, queue: [] };
}

/** Solved or thrown out: everything lights. */
export function revealAll(ps: PuzzleState): PuzzleState {
  if (ps.queue.length === 0 && ps.shown.every(Boolean)) return ps;
  return { ...ps, shown: ps.tiles.map(() => true), queue: [] };
}

/** Same Letter puzzles pay a flat $1,000 for calling the shared letter (once, when it is in the puzzle). */
export function sameLetterBonus(ps: PuzzleState, letter: string): boolean {
  const shared = ps.puzzle.sameLetter?.toUpperCase();
  return shared !== undefined && shared === letter && hasLetter(ps, letter) && !ps.called.includes(letter);
}
