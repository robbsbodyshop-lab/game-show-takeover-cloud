import { describe, expect, it } from 'vitest';
import {
  applyGravityStep,
  capsuleHalves,
  cellAt,
  clearCells,
  cloneBoard,
  countGerms,
  createEmptyBoard,
  findFallingCells,
  findRuns,
  formsRunOfFour,
  isCapsuleSupported,
  lockCapsule,
  placeGerms,
  rotateCapsule,
  runCells,
  setCell,
  spawnCapsule,
  tryMove,
} from './board';
import { createRng } from './rng';
import { parseBoard } from './testHelpers';
import type { Board, Capsule } from './types';
import { COLS, ROWS } from './types';

const cap = (
  row: number,
  col: number,
  orientation: 'h' | 'v',
  a: 1 | 2 | 3 = 1,
  b: 1 | 2 | 3 = 2,
): Capsule => ({
  row,
  col,
  orientation,
  colors: [a, b],
});

function assertInBounds(c: Capsule): void {
  for (const h of capsuleHalves(c)) {
    expect(h.row).toBeGreaterThanOrEqual(0);
    expect(h.row).toBeLessThan(ROWS);
    expect(h.col).toBeGreaterThanOrEqual(0);
    expect(h.col).toBeLessThan(COLS);
  }
}

describe('germ placement', () => {
  it('places exactly `level` germs in rows 5-15 for every level', () => {
    for (let level = 1; level <= 20; level++) {
      const board = createEmptyBoard();
      const placed = placeGerms(board, level, createRng(level * 31));
      expect(placed).toBe(level);
      expect(countGerms(board)).toBe(level);
      for (let r = 0; r < 5; r++) expect(board[r]?.every((c) => c.kind === 'empty')).toBe(true);
    }
  });

  it('never pre-forms a run of 4 (deliberate fix) and uses all three colours', () => {
    const colors = new Set<number>();
    for (let seed = 0; seed < 300; seed++) {
      const board = createEmptyBoard();
      placeGerms(board, 20, createRng(seed));
      expect(findRuns(board)).toEqual([]);
      for (const row of board) for (const cell of row) if (cell.kind === 'germ') colors.add(cell.color);
    }
    expect([...colors].sort()).toEqual([1, 2, 3]);
  });

  it('is deterministic for a seed', () => {
    const a = createEmptyBoard();
    const b = createEmptyBoard();
    placeGerms(a, 15, createRng(5));
    placeGerms(b, 15, createRng(5));
    expect(a).toEqual(b);
  });

  it('formsRunOfFour detects horizontal and vertical completions', () => {
    const board = parseBoard(['AAA.....', '........']);
    expect(formsRunOfFour(board, 14, 3, 1)).toBe(true);
    expect(formsRunOfFour(board, 14, 3, 2)).toBe(false);
    const v = parseBoard(['A.......', 'A.......', 'A.......', '........']);
    expect(formsRunOfFour(v, 15, 0, 1)).toBe(true);
  });
});

describe('spawn and movement', () => {
  it('spawns horizontally at row 0 cols 3-4, or null when a spawn cell is taken', () => {
    const board = createEmptyBoard();
    const c = spawnCapsule(board, [2, 3]);
    expect(c).toEqual({ row: 0, col: 3, orientation: 'h', colors: [2, 3] });
    expect(capsuleHalves(c!).map((h) => [h.row, h.col])).toEqual([
      [0, 3],
      [0, 4],
    ]);
    setCell(board, 0, 4, { kind: 'half', color: 1, partnerDir: null });
    expect(spawnCapsule(board, [1, 1])).toBeNull();
    const other = createEmptyBoard();
    setCell(other, 0, 3, { kind: 'germ', color: 1 });
    expect(spawnCapsule(other, [1, 1])).toBeNull();
  });

  it('blocks movement at walls, floor and occupied cells', () => {
    const board = parseBoard(['..a.....']);
    expect(tryMove(board, cap(5, 0, 'h'), 0, -1)).toBeNull();
    expect(tryMove(board, cap(5, 6, 'h'), 0, 1)).toBeNull();
    expect(tryMove(board, cap(5, 6, 'h'), 0, -1)).not.toBeNull();
    expect(tryMove(board, cap(15, 2, 'h'), 1, 0)).toBeNull();
    expect(tryMove(board, cap(14, 0, 'h'), 0, 1)).not.toBeNull();
    expect(tryMove(board, cap(15, 0, 'h'), 0, 1)).toBeNull(); // (15,2) is occupied
    expect(isCapsuleSupported(board, cap(14, 1, 'h'))).toBe(true);
    expect(isCapsuleSupported(board, cap(10, 1, 'h'))).toBe(false);
  });
});

describe('rotation', () => {
  it('ccw follows the source geometry and cw is its inverse', () => {
    const board = createEmptyBoard();
    const h = cap(8, 3, 'h', 1, 2);
    const v = rotateCapsule(board, h, 'ccw');
    expect(v).toEqual({ row: 8, col: 3, orientation: 'v', colors: [1, 2] });
    expect(capsuleHalves(v!).map((x) => [x.row, x.col, x.color])).toEqual([
      [8, 3, 1],
      [7, 3, 2],
    ]);
    const back = rotateCapsule(board, v!, 'ccw');
    expect(back).toEqual({ row: 8, col: 3, orientation: 'h', colors: [2, 1] }); // colours swap
    expect(rotateCapsule(board, v!, 'cw')).toEqual(h);
    const cwV = rotateCapsule(board, h, 'cw')!;
    expect(cwV.colors).toEqual([2, 1]);
    expect(rotateCapsule(board, cwV, 'ccw')).toEqual(h);
  });

  it('kicks left at the right wall instead of leaving the board', () => {
    const board = createEmptyBoard();
    const out = rotateCapsule(board, cap(8, 7, 'v'), 'ccw');
    expect(out).toEqual({ row: 8, col: 6, orientation: 'h', colors: [2, 1] });
  });

  it('kicks left when the cell to the right is occupied', () => {
    const board = parseBoard(['.....a..', '........']);
    const out = rotateCapsule(board, cap(14, 4, 'v'), 'ccw');
    expect(out).toMatchObject({ col: 3, orientation: 'h' });
  });

  it('refuses at the left wall when the right cell is occupied and never writes column -1', () => {
    const board = parseBoard(['.a......', 'AA......']);
    const v = cap(14, 0, 'v');
    // (14,1) is blocked; left kick would be column -1; up kick needs (13,1) free which it is.
    const out = rotateCapsule(board, v, 'ccw');
    expect(out).toMatchObject({ row: 13, col: 0, orientation: 'h' });
    // Now block the up kick as well: no rotation at all.
    const tight = parseBoard(['.a......', '.a......', 'AA......']);
    expect(rotateCapsule(tight, cap(14, 0, 'v'), 'ccw')).toBeNull();
    expect(rotateCapsule(tight, cap(14, 0, 'v'), 'cw')).toBeNull();
  });

  it('kicks right when the vertical pose is blocked on the left side', () => {
    const board = parseBoard(['.a......', '.a......', '........']);
    // horizontal at (15,3)-(15,4); above main (14,3) free, so no kick needed...
    expect(rotateCapsule(board, cap(15, 3, 'h'), 'ccw')).toMatchObject({ col: 3, orientation: 'v' });
    // block above main, and the left column above: kick right to col 4
    const b2 = parseBoard(['........', '..aa....', '........']);
    const out = rotateCapsule(b2, cap(15, 3, 'h'), 'ccw');
    expect(out).toMatchObject({ row: 15, col: 4, orientation: 'v' });
  });

  it('kicks up over a ledge when both sides are blocked', () => {
    const board = parseBoard(['........', '.a......', 'AA......']);
    const out = rotateCapsule(board, cap(14, 0, 'v'), 'ccw');
    // (14,1) is occupied and column -1 does not exist, so the capsule hops up one row
    expect(out).toEqual({ row: 13, col: 0, orientation: 'h', colors: [2, 1] });
    assertInBounds(out!);
  });

  it('can rotate a fresh capsule on row 0 (documented fix) by dropping one row', () => {
    const board = createEmptyBoard();
    const out = rotateCapsule(board, cap(0, 3, 'h'), 'ccw');
    expect(out).toEqual({ row: 1, col: 3, orientation: 'v', colors: [1, 2] });
    // row 1 full: nowhere to go, so no rotation
    expect(rotateCapsule(createFilledRow1(), cap(0, 3, 'h'), 'ccw')).toBeNull();
  });

  it('never yields an out-of-bounds pose or overlap, for every position on a cluttered board', () => {
    const board = createEmptyBoard();
    placeGerms(board, 20, createRng(11));
    setCell(board, 3, 0, { kind: 'half', color: 1, partnerDir: null });
    setCell(board, 3, 7, { kind: 'half', color: 2, partnerDir: null });
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        for (const o of ['h', 'v'] as const) {
          const start = cap(r, c, o);
          const halves = capsuleHalves(start);
          const startFits = halves.every((h) => cellAt(board, h.row, h.col)?.kind === 'empty');
          if (!startFits) continue;
          for (const dir of ['cw', 'ccw'] as const) {
            const out = rotateCapsule(board, start, dir);
            if (!out) continue;
            assertInBounds(out);
            for (const h of capsuleHalves(out)) expect(cellAt(board, h.row, h.col)?.kind).toBe('empty');
          }
        }
      }
    }
  });
});

function createFilledRow1(): Board {
  const board = createEmptyBoard();
  for (let c = 0; c < COLS; c++) setCell(board, 1, c, { kind: 'half', color: 1, partnerDir: null });
  return board;
}

describe('match scan', () => {
  it('finds horizontal and vertical runs of 4 or more only', () => {
    const board = parseBoard(['AAA.....', 'BBBB....', '.CCCCC..']);
    const runs = findRuns(board);
    expect(runs.map((r) => [r.orientation, r.color, r.cells.length])).toEqual([
      ['h', 2, 4],
      ['h', 3, 5],
    ]);
  });

  it('matches a run ending on the last row (bottom row)', () => {
    const board = parseBoard(['aaaa....']);
    expect(findRuns(board)).toHaveLength(1);
  });

  it('matches a vertical run ending at the last column and last row', () => {
    const board = parseBoard(['.......b', '.......b', '.......b', '.......b']);
    const runs = findRuns(board);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.cells[3]).toEqual({ row: 15, col: 7 });
  });

  it('matches a horizontal run ending at column 7 on the last row', () => {
    const board = parseBoard(['....cccc']);
    expect(runCells(board, findRuns(board))).toHaveLength(4);
  });

  it('does not carry a run across rows (source bug: line-start runs were missed)', () => {
    const board = parseBoard(['....aaaa', 'aaaa....']);
    const runs = findRuns(board);
    expect(runs).toHaveLength(2);
  });

  it('does not join runs across the right edge to the next row or column', () => {
    const board = parseBoard(['......aa', 'aa......']);
    expect(findRuns(board)).toEqual([]);
  });

  it('clears horizontal and vertical runs sharing a cell (T/L shapes) once each', () => {
    const board = parseBoard(['.a......', '.a......', '.a......', 'aaaa....']);
    const runs = findRuns(board);
    expect(runs).toHaveLength(2);
    const cells = runCells(board, runs);
    expect(cells).toHaveLength(7); // 4 + 4 sharing one cell
    clearCells(board, cells);
    expect(board.every((row) => row.every((c) => c.kind === 'empty'))).toBe(true);
  });

  it('reports whether a run contains a germ', () => {
    const board = parseBoard(['Aaaa....', 'bbbb....']);
    const runs = findRuns(board);
    expect(runs.map((r) => r.hasGerm)).toEqual([true, false]);
  });
});

describe('clearing', () => {
  it('splits a capsule when only one half is cleared', () => {
    const board = createEmptyBoard();
    lockCapsule(board, cap(15, 3, 'h', 1, 2));
    clearCells(board, [{ row: 15, col: 3 }]);
    expect(cellAt(board, 15, 3)).toEqual({ kind: 'empty' });
    expect(cellAt(board, 15, 4)).toEqual({ kind: 'half', color: 2, partnerDir: null });
  });

  it('removes both halves when both are cleared and counts germs', () => {
    const board = createEmptyBoard();
    lockCapsule(board, cap(15, 3, 'v', 1, 1));
    setCell(board, 15, 0, { kind: 'germ', color: 1 });
    const germs = clearCells(board, [
      { row: 15, col: 3 },
      { row: 14, col: 3 },
      { row: 15, col: 0 },
    ]);
    expect(germs).toBe(1);
    expect(board.every((row) => row.every((c) => c.kind === 'empty'))).toBe(true);
  });
});

describe('gravity', () => {
  it('drops a loose half one row per step and stops on the floor', () => {
    const board = parseBoard(['a.......', '........', '........']);
    expect(applyGravityStep(board)).toBe(1);
    expect(cellAt(board, 14, 0)?.kind).toBe('half');
    expect(applyGravityStep(board)).toBe(1);
    expect(cellAt(board, 15, 0)?.kind).toBe('half');
    expect(applyGravityStep(board)).toBe(0);
  });

  it('lets a vertical capsule fall (source bug: it hung in mid-air)', () => {
    const board = createEmptyBoard();
    lockCapsule(board, cap(10, 2, 'v', 1, 2));
    expect(findFallingCells(board)).toHaveLength(2);
    applyGravityStep(board);
    expect(cellAt(board, 11, 2)).toEqual({ kind: 'half', color: 1, partnerDir: 'up' });
    expect(cellAt(board, 10, 2)).toEqual({ kind: 'half', color: 2, partnerDir: 'down' });
    expect(cellAt(board, 9, 2)?.kind).toBe('empty');
  });

  it('keeps a vertical capsule standing on a germ', () => {
    const board = parseBoard(['..A.....']);
    lockCapsule(board, cap(14, 2, 'v'));
    expect(findFallingCells(board)).toHaveLength(0);
  });

  it('a horizontal capsule falls only when both halves are unsupported', () => {
    const board = parseBoard(['A.......']);
    lockCapsule(board, cap(14, 0, 'h'));
    expect(findFallingCells(board)).toHaveLength(0); // left half rests on the germ
    const open = createEmptyBoard();
    lockCapsule(open, cap(14, 0, 'h'));
    expect(findFallingCells(open)).toHaveLength(2);
  });

  it('a floating stack falls together without opening gaps', () => {
    const board = parseBoard(['a.......', 'b.......', 'c.......', '........', '........']);
    applyGravityStep(board);
    expect(cellAt(board, 11, 0)?.kind).toBe('empty');
    // contiguous: rows 12-14 hold colours 1,2,3 in order
    expect([12, 13, 14].map((r) => (cellAt(board, r, 0) as { color: number }).color)).toEqual([1, 2, 3]);
    expect(cellAt(board, 15, 0)?.kind).toBe('empty');
  });

  it('pieces resting on a floor-supported piece stay put', () => {
    const board = parseBoard(['a.......', 'b.......']);
    expect(findFallingCells(board)).toHaveLength(0);
  });

  it('clone keeps boards independent', () => {
    const a = createEmptyBoard();
    const b = cloneBoard(a);
    setCell(b, 0, 0, { kind: 'germ', color: 1 });
    expect(cellAt(a, 0, 0)?.kind).toBe('empty');
  });
});
