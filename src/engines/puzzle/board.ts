/**
 * Board mechanics: placement, collision, rotation, lock, matching, clearing and gravity.
 * Implements docs/PUZZLE_GAME_MECHANICS.md sections 2-5 with the [FIX] behaviours:
 * free-space rotation with kicks, full-board per-line match scan, vertical capsules fall,
 * a whole unsupported mass falls together. Functions that take a `Board` and are named as
 * mutators (place, lock, clear, apply) change it in place; the reducer clones first.
 */
import type {
  Board,
  Capsule,
  Cell,
  Color,
  ColoredPt,
  Dir,
  GermCell,
  HalfCell,
  Orientation,
  Pt,
} from './types';
import { COLS, GERM_MIN_ROW, ROWS, SPAWN_COL, SPAWN_ROW } from './types';

const DIR_DELTA: Record<Dir, Pt> = {
  up: { row: -1, col: 0 },
  down: { row: 1, col: 0 },
  left: { row: 0, col: -1 },
  right: { row: 0, col: 1 },
};

export function createEmptyBoard(): Board {
  const rows: Board = [];
  for (let r = 0; r < ROWS; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < COLS; c++) row.push({ kind: 'empty' });
    rows.push(row);
  }
  return rows;
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => ({ ...cell })));
}

export function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < ROWS && col >= 0 && col < COLS;
}

export function cellAt(board: Board, row: number, col: number): Cell | undefined {
  return board[row]?.[col];
}

export function setCell(board: Board, row: number, col: number, cell: Cell): void {
  const line = board[row];
  if (line && col >= 0 && col < COLS) line[col] = cell;
}

export function isFree(board: Board, row: number, col: number): boolean {
  return cellAt(board, row, col)?.kind === 'empty';
}

export function countGerms(board: Board): number {
  let n = 0;
  for (const row of board) for (const cell of row) if (cell.kind === 'germ') n++;
  return n;
}

export function isBoardEmptyOfPieces(board: Board): boolean {
  return board.every((row) => row.every((cell) => cell.kind === 'empty'));
}

// ---------------------------------------------------------------------------------------------
// Germ placement
// ---------------------------------------------------------------------------------------------

function lineLength(board: Board, row: number, col: number, color: Color, dr: number, dc: number): number {
  let n = 0;
  let r = row + dr;
  let c = col + dc;
  for (;;) {
    const cell = cellAt(board, r, c);
    if (!cell || cell.kind === 'empty' || cell.color !== color) return n;
    n++;
    r += dr;
    c += dc;
  }
}

/** True when putting `color` at (row, col) would make a straight run of 4 or more. */
export function formsRunOfFour(board: Board, row: number, col: number, color: Color): boolean {
  const horizontal = 1 + lineLength(board, row, col, color, 0, -1) + lineLength(board, row, col, color, 0, 1);
  const vertical = 1 + lineLength(board, row, col, color, -1, 0) + lineLength(board, row, col, color, 1, 0);
  return horizontal >= 4 || vertical >= 4;
}

/**
 * Places `count` germs in rows 5-15, uniform colours, one (row, col, colour) draw triple per
 * attempt in that order (as the source does). DELIBERATE FIX: an attempt whose germ would complete
 * a run of 4 is rejected, so a fresh board never contains a pre-formed match (the source allowed
 * them, and they auto-cleared before the first capsule). Returns the number placed.
 */
export function placeGerms(board: Board, count: number, rng: () => number): number {
  const rows = ROWS - GERM_MIN_ROW;
  const capacity = rows * COLS;
  const target = Math.max(0, Math.min(count, capacity));
  let placed = 0;
  let attempts = 0;
  while (placed < target && attempts < 20000) {
    attempts++;
    const row = GERM_MIN_ROW + Math.floor(rng() * rows);
    const col = Math.floor(rng() * COLS);
    const color = (1 + Math.floor(rng() * 3)) as Color;
    if (!isFree(board, row, col)) continue;
    if (formsRunOfFour(board, row, col, color)) continue;
    setCell(board, row, col, { kind: 'germ', color });
    placed++;
  }
  return placed;
}

// ---------------------------------------------------------------------------------------------
// Capsule geometry
// ---------------------------------------------------------------------------------------------

export interface CapsuleHalf extends Pt {
  color: Color;
  partnerDir: Dir;
}

export function capsuleHalves(cap: Capsule): [CapsuleHalf, CapsuleHalf] {
  if (cap.orientation === 'h') {
    return [
      { row: cap.row, col: cap.col, color: cap.colors[0], partnerDir: 'right' },
      { row: cap.row, col: cap.col + 1, color: cap.colors[1], partnerDir: 'left' },
    ];
  }
  return [
    { row: cap.row, col: cap.col, color: cap.colors[0], partnerDir: 'up' },
    { row: cap.row - 1, col: cap.col, color: cap.colors[1], partnerDir: 'down' },
  ];
}

export function capsuleFits(board: Board, cap: Capsule): boolean {
  return capsuleHalves(cap).every((h) => isFree(board, h.row, h.col));
}

export function spawnCapsule(board: Board, colors: [Color, Color]): Capsule | null {
  const cap: Capsule = { row: SPAWN_ROW, col: SPAWN_COL, orientation: 'h', colors };
  return capsuleFits(board, cap) ? cap : null;
}

/** Moves by (dRow, dCol) if the destination is free and in bounds; otherwise null. */
export function tryMove(board: Board, cap: Capsule, dRow: number, dCol: number): Capsule | null {
  const moved: Capsule = { ...cap, row: cap.row + dRow, col: cap.col + dCol };
  return capsuleFits(board, moved) ? moved : null;
}

/** True when the capsule cannot move down (floor or a cell below either half). */
export function isCapsuleSupported(board: Board, cap: Capsule): boolean {
  return tryMove(board, cap, 1, 0) === null;
}

/**
 * Rotates 90 degrees about the main half. `ccw` follows the source geometry (horizontal to
 * vertical puts the second half above main, colours kept; vertical to horizontal swaps colours);
 * `cw` is its exact inverse. The target pose must be fully free and in bounds. If it is not,
 * kicks are tried in order: one column left, one column right, one row up. A horizontal capsule
 * on row 0 may also be pushed down one row so a fresh capsule can rotate immediately (the source
 * could not; [FIX]). Returns null when no pose fits, so nothing is ever written out of bounds.
 */
export function rotateCapsule(board: Board, cap: Capsule, dir: 'cw' | 'ccw'): Capsule | null {
  const toVertical = cap.orientation === 'h';
  const orientation: Orientation = toVertical ? 'v' : 'h';
  const swap = dir === 'ccw' ? !toVertical : toVertical;
  const colors: [Color, Color] = swap ? [cap.colors[1], cap.colors[0]] : cap.colors;
  const kicks: [number, number][] = [
    [0, 0],
    [0, -1],
    [0, 1],
    [-1, 0],
  ];
  if (toVertical && cap.row === 0) kicks.push([1, 0]);
  for (const [dRow, dCol] of kicks) {
    const pose: Capsule = { row: cap.row + dRow, col: cap.col + dCol, orientation, colors };
    if (capsuleFits(board, pose)) return pose;
  }
  return null;
}

/** Writes both halves into the board as one linked capsule. Returns the written cells. */
export function lockCapsule(board: Board, cap: Capsule): ColoredPt[] {
  const out: ColoredPt[] = [];
  for (const h of capsuleHalves(cap)) {
    const cell: HalfCell = { kind: 'half', color: h.color, partnerDir: h.partnerDir };
    setCell(board, h.row, h.col, cell);
    out.push({ row: h.row, col: h.col, color: h.color, germ: false });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Matching and clearing
// ---------------------------------------------------------------------------------------------

export interface Run {
  color: Color;
  orientation: Orientation;
  cells: Pt[];
  hasGerm: boolean;
}

function scanLine(board: Board, orientation: Orientation, index: number, out: Run[]): void {
  const length = orientation === 'h' ? COLS : ROWS;
  const get = (i: number): Cell | undefined =>
    orientation === 'h' ? cellAt(board, index, i) : cellAt(board, i, index);
  let i = 0;
  while (i < length) {
    const first = get(i);
    if (!first || first.kind === 'empty') {
      i++;
      continue;
    }
    let j = i + 1;
    for (;;) {
      const next = j < length ? get(j) : undefined;
      if (!next || next.kind === 'empty' || next.color !== first.color) break;
      j++;
    }
    // The run is flushed at the end of the line too, so runs on the last row/column count.
    if (j - i >= 4) {
      const cells: Pt[] = [];
      let hasGerm = false;
      for (let k = i; k < j; k++) {
        cells.push(orientation === 'h' ? { row: index, col: k } : { row: k, col: index });
        if (get(k)?.kind === 'germ') hasGerm = true;
      }
      out.push({ color: first.color, orientation, cells, hasGerm });
    }
    i = j;
  }
}

/** Full-board scan: every row left to right, then every column top to bottom. Runs of 4+ only. */
export function findRuns(board: Board): Run[] {
  const runs: Run[] = [];
  for (let r = 0; r < ROWS; r++) scanLine(board, 'h', r, runs);
  for (let c = 0; c < COLS; c++) scanLine(board, 'v', c, runs);
  return runs;
}

/** Union of all cells in the runs (cells in two runs appear once), sorted by row then column. */
export function runCells(board: Board, runs: Run[]): ColoredPt[] {
  const seen = new Set<number>();
  const out: ColoredPt[] = [];
  for (const run of runs) {
    for (const p of run.cells) {
      const key = p.row * COLS + p.col;
      if (seen.has(key)) continue;
      seen.add(key);
      const cell = cellAt(board, p.row, p.col);
      if (cell && cell.kind !== 'empty') {
        out.push({ row: p.row, col: p.col, color: cell.color, germ: cell.kind === 'germ' });
      }
    }
  }
  return out.sort((a, b) => a.row - b.row || a.col - b.col);
}

/**
 * Removes the given cells simultaneously. A capsule half whose partner survives turns into a
 * lone half (partnerDir null), so it falls on its own. Returns how many germs were removed.
 */
export function clearCells(board: Board, cells: Pt[]): number {
  const keys = new Set(cells.map((p) => p.row * COLS + p.col));
  let germs = 0;
  for (const p of cells) {
    const cell = cellAt(board, p.row, p.col);
    if (!cell || cell.kind === 'empty') continue;
    if (cell.kind === 'germ') germs++;
    if (cell.kind === 'half' && cell.partnerDir) {
      const d = DIR_DELTA[cell.partnerDir];
      const pr = p.row + d.row;
      const pc = p.col + d.col;
      const partner = cellAt(board, pr, pc);
      if (partner?.kind === 'half' && !keys.has(pr * COLS + pc)) partner.partnerDir = null;
    }
  }
  for (const p of cells) setCell(board, p.row, p.col, { kind: 'empty' });
  return germs;
}

// ---------------------------------------------------------------------------------------------
// Gravity
// ---------------------------------------------------------------------------------------------

function pieceCells(board: Board, row: number, col: number, cell: HalfCell): Pt[] | null {
  // Each linked pair is reported once, from its top/left cell; the other side returns null.
  if (cell.partnerDir === null) return [{ row, col }];
  if (cell.partnerDir === 'left' || cell.partnerDir === 'up') {
    const d = DIR_DELTA[cell.partnerDir];
    const partner = cellAt(board, row + d.row, col + d.col);
    // A dangling link (partner missing) is treated as a lone half rather than lost.
    return partner?.kind === 'half' ? null : [{ row, col }];
  }
  const d = DIR_DELTA[cell.partnerDir];
  const partner = cellAt(board, row + d.row, col + d.col);
  return partner?.kind === 'half'
    ? [
        { row, col },
        { row: row + d.row, col: col + d.col },
      ]
    : [{ row, col }];
}

/**
 * Cells belonging to pieces (lone halves and whole capsules, either orientation) with nothing
 * holding them up. Germs are fixed supports. A piece resting only on another falling piece falls
 * with it, so a floating stack moves as one mass.
 */
export function findFallingCells(board: Board): Pt[] {
  const pieces: Pt[][] = [];
  const pieceId: number[][] = board.map((row) => row.map(() => -1));
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = cellAt(board, r, c);
      if (cell?.kind !== 'half') continue;
      const cells = pieceCells(board, r, c, cell);
      if (!cells) continue;
      const id = pieces.length;
      pieces.push(cells);
      for (const p of cells) {
        const line = pieceId[p.row];
        if (line) line[p.col] = id;
      }
    }
  }
  const falling = new Set<number>(pieces.map((_, i) => i));
  const supported = (id: number): boolean => {
    for (const p of pieces[id] ?? []) {
      const br = p.row + 1;
      if (br >= ROWS) return true;
      const below = cellAt(board, br, p.col);
      if (!below || below.kind === 'empty') continue;
      const belowId = pieceId[br]?.[p.col] ?? -1;
      if (belowId === id) continue; // own partner
      if (below.kind === 'germ') return true;
      if (!falling.has(belowId)) return true;
    }
    return false;
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...falling]) {
      if (supported(id)) {
        falling.delete(id);
        changed = true;
      }
    }
  }
  const out: Pt[] = [];
  for (const id of falling) out.push(...(pieces[id] ?? []));
  return out;
}

/** Moves every unsupported piece down one row at once. Returns the number of cells moved. */
export function applyGravityStep(board: Board): number {
  const cells = findFallingCells(board).sort((a, b) => b.row - a.row);
  for (const p of cells) {
    const cell = cellAt(board, p.row, p.col);
    if (!cell) continue;
    setCell(board, p.row + 1, p.col, cell);
    setCell(board, p.row, p.col, { kind: 'empty' });
  }
  return cells.length;
}

/** True when matches or falling pieces still need resolving. */
export function hasPendingWork(board: Board): boolean {
  return findRuns(board).length > 0 || findFallingCells(board).length > 0;
}

export function germCell(color: Color): GermCell {
  return { kind: 'germ', color };
}
