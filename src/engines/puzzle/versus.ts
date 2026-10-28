/**
 * Two-player versus rules (FR-062; this project's design, documented here because the source had
 * no attacks at all, docs/PUZZLE_GAME_MECHANICS.md section 7.2).
 *
 * - A clear step that removes 2 or more distinct runs that each contain a germ sends
 *   min(runs, 4) lone half-capsules, in the colours of those runs, to the opponent.
 * - Garbage waits in the opponent's queue and drops from row 0 into distinct random columns when
 *   that player's next capsule locks.
 * - Opponent top-out, or clearing every germ, ends the round; first to 3 round wins takes the match.
 */
import { cellAt, setCell } from './board';
import type { Run } from './board';
import type { Board, Color, ColoredPt } from './types';
import { COLS, ROUNDS_TO_WIN } from './types';

export const GARBAGE_MIN_RUNS = 2;
export const GARBAGE_MAX = 4;

/** Colours to send for one clear step: empty unless 2+ germ-bearing runs were cleared. */
export function garbageForRuns(runs: readonly Run[]): Color[] {
  const germRuns = runs.filter((r) => r.hasGerm);
  if (germRuns.length < GARBAGE_MIN_RUNS) return [];
  return germRuns.slice(0, Math.min(germRuns.length, GARBAGE_MAX)).map((r) => r.color);
}

/** `count` distinct columns chosen with a partial Fisher-Yates shuffle (one draw per pick). */
export function pickGarbageColumns(count: number, rng: () => number): number[] {
  const cols = Array.from({ length: COLS }, (_, i) => i);
  const n = Math.min(count, COLS);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (COLS - i));
    const a = cols[i];
    const b = cols[j];
    if (a === undefined || b === undefined) continue;
    cols[i] = b;
    cols[j] = a;
  }
  return cols.slice(0, n);
}

/**
 * Puts one lone half per colour at row 0 of its column (they then fall as loose halves). A column
 * whose top cell is already taken loses its half. Returns the cells actually placed.
 */
export function dropGarbage(board: Board, colors: readonly Color[], columns: readonly number[]): ColoredPt[] {
  const placed: ColoredPt[] = [];
  colors.forEach((color, i) => {
    const col = columns[i];
    if (col === undefined) return;
    if (cellAt(board, 0, col)?.kind !== 'empty') return;
    setCell(board, 0, col, { kind: 'half', color, partnerDir: null });
    placed.push({ row: 0, col, color, germ: false });
  });
  return placed;
}

/** True when `wins` has reached the match target. */
export function hasWonMatch(wins: number): boolean {
  return wins >= ROUNDS_TO_WIN;
}
