/**
 * Types for the capsule puzzle engine. Implements docs/PUZZLE_GAME_MECHANICS.md (corrected
 * behaviour) plus this project's scoring and versus design (FR-061, FR-062). Plain serializable
 * data only: no Set, Map or functions.
 */

export const COLS = 8;
export const ROWS = 16;
export const SPAWN_ROW = 0;
export const SPAWN_COL = 3;
export const GERM_MIN_ROW = 5;
export const MAX_LEVEL = 20;
export const ROUNDS_TO_WIN = 3;

export type Color = 1 | 2 | 3;
export type Dir = 'up' | 'down' | 'left' | 'right';

export interface EmptyCell {
  kind: 'empty';
}
export interface GermCell {
  kind: 'germ';
  color: Color;
}
/** One half of a capsule. `partnerDir` points at the other half, or null for a lone half. */
export interface HalfCell {
  kind: 'half';
  color: Color;
  partnerDir: Dir | null;
}
export type Cell = EmptyCell | GermCell | HalfCell;

/** `board[row][col]`, 16 rows by 8 columns, row 0 at the top. */
export type Board = Cell[][];

export type Orientation = 'h' | 'v';

/**
 * `row`/`col` locate the main half (`colors[0]`). Horizontal: the second half is at (row, col+1).
 * Vertical: the second half is directly above, at (row-1, col).
 */
export interface Capsule {
  row: number;
  col: number;
  orientation: Orientation;
  colors: [Color, Color];
}

export type Speed = 'low' | 'med' | 'hi';
export type Mode = '1p' | '2p';

export type PlayerStatus = 'playing' | 'clearing' | 'topped-out' | 'cleared';

export interface PlayerStats {
  germsStart: number;
  capsulesLocked: number;
  germsCleared: number;
  clearSteps: number;
  maxCascade: number;
  garbageSent: number;
  garbageReceived: number;
}

export interface PlayerState {
  board: Board;
  active: Capsule | null;
  next: [Color, Color];
  level: number;
  speed: Speed;
  score: number;
  germsLeft: number;
  status: PlayerStatus;
  gravityMs: number;
  gravityAcc: number;
  /** Colours of half-capsules queued by the opponent; dropped on this player's next lock. */
  pendingGarbage: Color[];
  /** Clear steps already resolved since the last lock; drives the cascade multiplier. */
  cascadeIndex: number;
  stats: PlayerStats;
}

export type MatchStatus = 'idle' | 'playing' | 'paused' | 'round-over' | 'match-over';

export interface Pt {
  row: number;
  col: number;
}
export interface ColoredPt extends Pt {
  color: Color;
  germ: boolean;
}

export type PuzzleEventBody =
  | { type: 'spawn'; player: number; capsule: Capsule }
  | { type: 'move'; player: number; dir: 'left' | 'right' | 'down'; auto: boolean; capsule: Capsule }
  | { type: 'rotate'; player: number; dir: 'cw' | 'ccw'; capsule: Capsule }
  | { type: 'lock'; player: number; cells: ColoredPt[]; hard: boolean }
  | { type: 'fall'; player: number }
  | { type: 'clear'; player: number; cells: ColoredPt[]; cascadeIndex: number }
  | { type: 'cascade'; player: number; index: number }
  | { type: 'germ-cleared'; player: number; count: number; points: number; germsLeft: number }
  | { type: 'level-clear'; player: number; level: number; bonus: number }
  | { type: 'top-out'; player: number }
  | { type: 'garbage-sent'; player: number; to: number; colors: Color[] }
  | { type: 'garbage-received'; player: number; colors: Color[]; columns: number[] }
  | { type: 'round-won'; player: number | null; round: number }
  | { type: 'match-won'; player: number }
  | { type: 'paused' }
  | { type: 'resumed' };

export type PuzzleEvent = PuzzleEventBody & { seq: number };

export interface MatchState {
  mode: Mode;
  players: PlayerState[];
  /** 2P: rounds won per player. 1P: levels cleared (index 0). */
  roundWins: number[];
  round: number;
  status: MatchStatus;
  /** Index of the round winner once `status` is round-over/match-over; null for a 1P top-out. */
  roundWinner: number | null;
  matchWinner: number | null;
  seed: number;
  /** Serializable mulberry32 state; every draw (germs, capsules, garbage columns) comes from it. */
  rngState: number;
  /** Presentation events, oldest first, capped; `seq` is monotonic for the life of the match. */
  events: PuzzleEvent[];
  nextSeq: number;
}

export type PuzzleInput = 'left' | 'right' | 'down' | 'rotate-cw' | 'rotate-ccw' | 'hard-drop';

export type PuzzleAction =
  | { type: 'NEW_MATCH'; mode: Mode; levels: number[]; speeds: Speed[]; seed: number }
  | { type: 'START_ROUND' }
  | { type: 'INPUT'; player: number; input: PuzzleInput }
  | { type: 'TICK'; ms: number }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'NEXT_ROUND' };
