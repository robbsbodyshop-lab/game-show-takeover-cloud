/**
 * Test-only helpers for the puzzle engine. Boards are written as ASCII rows aligned to the bottom:
 * '.' empty, 'A' 'B' 'C' germs of colour 1 2 3, 'a' 'b' 'c' lone capsule halves of colour 1 2 3.
 */
import { cloneBoard, countGerms, createEmptyBoard, setCell } from './board';
import { createPuzzleState, reducePuzzle } from './puzzleEngine';
import type { Board, Capsule, Cell, Color, MatchState, Mode, PlayerState, Speed } from './types';
import { COLS, ROWS } from './types';

const COLOR: Record<string, Color> = { A: 1, B: 2, C: 3, a: 1, b: 2, c: 3 };

export function parseBoard(rows: string[]): Board {
  const board = createEmptyBoard();
  const offset = ROWS - rows.length;
  rows.forEach((line, i) => {
    if (line.length !== COLS) throw new Error(`row ${i} must have ${COLS} characters: "${line}"`);
    for (let col = 0; col < line.length; col++) {
      const ch = line.charAt(col);
      const color = COLOR[ch];
      if (color === undefined) continue;
      const cell: Cell =
        ch === ch.toUpperCase() ? { kind: 'germ', color } : { kind: 'half', color, partnerDir: null };
      setCell(board, offset + i, col, cell);
    }
  });
  return board;
}

export interface GameOptions {
  mode?: Mode;
  seed?: number;
  levels?: number[];
  speeds?: Speed[];
}

/** NEW_MATCH then START_ROUND. */
export function newGame(opts: GameOptions = {}): MatchState {
  const mode = opts.mode ?? '1p';
  const seed = opts.seed ?? 1234;
  const levels = opts.levels ?? [1, 1];
  const speeds = opts.speeds ?? ['low', 'low'];
  const created = reducePuzzle(createPuzzleState(), { type: 'NEW_MATCH', mode, levels, speeds, seed });
  return reducePuzzle(created, { type: 'START_ROUND' });
}

export function withPlayer(state: MatchState, index: number, patch: Partial<PlayerState>): MatchState {
  return {
    ...state,
    players: state.players.map((p, i) => (i === index ? { ...p, ...patch } : p)),
  };
}

/** Replaces a player's board and live capsule with a scripted position. */
export function setup(
  state: MatchState,
  index: number,
  board: Board,
  active: Capsule | null,
  next: [Color, Color] = [1, 2],
): MatchState {
  const copy = cloneBoard(board);
  return withPlayer(state, index, {
    board: copy,
    active,
    next,
    germsLeft: countGerms(copy),
    status: active ? 'playing' : 'clearing',
    gravityAcc: 0,
    cascadeIndex: 0,
    pendingGarbage: [],
  });
}

export function tick(state: MatchState, ms: number): MatchState {
  return reducePuzzle(state, { type: 'TICK', ms });
}

export function player(state: MatchState, index: number): PlayerState {
  const p = state.players[index];
  if (!p) throw new Error(`no player ${index}`);
  return p;
}

export function eventTypes(state: MatchState): string[] {
  return state.events.map((e) => e.type);
}
