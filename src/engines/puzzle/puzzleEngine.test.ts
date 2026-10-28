import { describe, expect, it } from 'vitest';
import { cellAt, createEmptyBoard, lockCapsule, setCell } from './board';
import { createPuzzleState, reducePuzzle } from './puzzleEngine';
import { createRng } from './rng';
import { eventTypes, newGame, parseBoard, player, setup, tick, withPlayer } from './testHelpers';
import type { Capsule, MatchState, PuzzleAction, PuzzleInput, Speed } from './types';
import { COLS, ROWS } from './types';

const flat = (): ReturnType<typeof createEmptyBoard> => createEmptyBoard();
const horizontalAt = (row: number, col: number): Capsule => ({ row, col, orientation: 'h', colors: [1, 2] });
const input = (state: MatchState, i: PuzzleInput, p = 0): MatchState =>
  reducePuzzle(state, { type: 'INPUT', player: p, input: i });

describe('match lifecycle', () => {
  it('NEW_MATCH builds an idle match with germs and a preview; START_ROUND spawns', () => {
    const created = reducePuzzle(createPuzzleState(), {
      type: 'NEW_MATCH',
      mode: '1p',
      levels: [7],
      speeds: ['med'],
      seed: 9,
    });
    expect(created.status).toBe('idle');
    const p = player(created, 0);
    expect(p.germsLeft).toBe(7);
    expect(p.gravityMs).toBe(500);
    expect(p.active).toBeNull();
    const started = reducePuzzle(created, { type: 'START_ROUND' });
    expect(started.status).toBe('playing');
    const sp = player(started, 0);
    expect(sp.active).toMatchObject({ row: 0, col: 3, orientation: 'h' });
    expect(sp.active?.colors).toEqual(p.next);
    expect(started.events[0]).toMatchObject({ type: 'spawn', seq: 1 });
  });

  it('rejects invalid NEW_MATCH and out-of-phase actions by returning the same object', () => {
    const idle = createPuzzleState();
    const bad: PuzzleAction[] = [
      { type: 'NEW_MATCH', mode: '1p', levels: [0], speeds: ['low'], seed: 1 },
      { type: 'NEW_MATCH', mode: '1p', levels: [21], speeds: ['low'], seed: 1 },
      { type: 'NEW_MATCH', mode: '2p', levels: [1], speeds: ['low', 'low'], seed: 1 },
      { type: 'NEW_MATCH', mode: '1p', levels: [1], speeds: [], seed: 1 },
      { type: 'NEW_MATCH', mode: '1p', levels: [1.5], speeds: ['low'], seed: 1 },
      { type: 'START_ROUND' },
      { type: 'TICK', ms: 100 },
      { type: 'PAUSE' },
      { type: 'RESUME' },
      { type: 'NEXT_ROUND' },
      { type: 'INPUT', player: 0, input: 'left' },
    ];
    for (const a of bad) expect(reducePuzzle(idle, a)).toBe(idle);
    const playing = newGame();
    expect(reducePuzzle(playing, { type: 'START_ROUND' })).toBe(playing);
    expect(reducePuzzle(playing, { type: 'NEXT_ROUND' })).toBe(playing);
    expect(reducePuzzle(playing, { type: 'RESUME' })).toBe(playing);
    expect(reducePuzzle(playing, { type: 'TICK', ms: 0 })).toBe(playing);
    expect(reducePuzzle(playing, { type: 'TICK', ms: Number.NaN })).toBe(playing);
    expect(reducePuzzle(playing, { type: 'INPUT', player: 5, input: 'left' })).toBe(playing);
  });

  it('does not mutate the previous state', () => {
    const s = newGame();
    const before = JSON.stringify(s);
    tick(s, 5000);
    input(s, 'left');
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('time-based gravity', () => {
  const cases: [Speed, number][] = [
    ['low', 1000],
    ['med', 500],
    ['hi', 250],
  ];
  it.each(cases)('%s speed drops one row per %i ms', (speed, ms) => {
    let s = newGame({ speeds: [speed, speed] });
    s = setup(s, 0, flat(), horizontalAt(0, 3));
    s = tick(s, ms - 1);
    expect(player(s, 0).active?.row).toBe(0);
    s = tick(s, 1);
    expect(player(s, 0).active?.row).toBe(1);
    s = tick(s, ms * 3);
    expect(player(s, 0).active?.row).toBe(4);
  });

  it('carries the remainder between ticks and handles many rows in one tick', () => {
    let s = newGame();
    s = setup(s, 0, flat(), horizontalAt(0, 3));
    for (let i = 0; i < 10; i++) s = tick(s, 150); // 1500 ms total
    expect(player(s, 0).active?.row).toBe(1);
    expect(player(s, 0).gravityAcc).toBe(500);
    s = tick(s, 4500);
    expect(player(s, 0).active?.row).toBe(6);
  });

  it('soft drop moves exactly one row and never locks', () => {
    let s = newGame();
    s = setup(s, 0, flat(), horizontalAt(14, 3));
    s = input(s, 'down');
    expect(player(s, 0).active?.row).toBe(15);
    const same = input(s, 'down');
    expect(same).toBe(s);
    expect(player(s, 0).active).not.toBeNull();
    expect(player(s, 0).stats.capsulesLocked).toBe(0);
  });
});

describe('inputs', () => {
  it('moves left and right, and returns the same object when blocked', () => {
    let s = newGame();
    s = setup(s, 0, flat(), horizontalAt(5, 0));
    expect(input(s, 'left')).toBe(s);
    const r = input(s, 'right');
    expect(player(r, 0).active?.col).toBe(1);
    const edge = setup(s, 0, flat(), horizontalAt(5, 6));
    expect(input(edge, 'right')).toBe(edge);
  });

  it('rotation is applied through the kicks and refused when impossible', () => {
    let s = newGame();
    s = setup(s, 0, flat(), { row: 8, col: 7, orientation: 'v', colors: [1, 2] });
    const kicked = input(s, 'rotate-ccw');
    expect(player(kicked, 0).active).toEqual({ row: 8, col: 6, orientation: 'h', colors: [2, 1] });
    expect(kicked.events.at(-1)).toMatchObject({ type: 'rotate', dir: 'ccw' });

    const walled = parseBoard(['.a......', '.a......', 'AA......']);
    const stuck = setup(s, 0, walled, { row: 14, col: 0, orientation: 'v', colors: [1, 2] });
    // up kick is blocked by (13,1)
    expect(input(stuck, 'rotate-cw')).toBe(stuck);
    expect(input(stuck, 'rotate-ccw')).toBe(stuck);
  });

  it('hard drop locks at the lowest position immediately', () => {
    let s = newGame();
    s = setup(s, 0, flat(), horizontalAt(3, 3));
    s = input(s, 'hard-drop');
    expect(cellAt(player(s, 0).board, 15, 3)).toMatchObject({ kind: 'half', color: 1, partnerDir: 'right' });
    expect(cellAt(player(s, 0).board, 15, 4)).toMatchObject({ kind: 'half', color: 2, partnerDir: 'left' });
    expect(eventTypes(s)).toContain('lock');
    // nothing left to resolve, so the next capsule has already spawned
    expect(player(s, 0).active).toMatchObject({ row: 0, col: 3 });
  });

  it('ignores input when there is no live capsule or the player index is wrong', () => {
    const s = setup(newGame(), 0, parseBoard(['aaaa....']), null);
    expect(input(s, 'left')).toBe(s);
    expect(input(s, 'left', 3)).toBe(s);
  });
});

describe('lock, clear, fall, cascade (one action per step)', () => {
  const germRow = ['.......C', '........', '........', '........', '........', 'AAA.....'];
  const active: Capsule = { row: 15, col: 3, orientation: 'v', colors: [1, 2] };

  it('does exactly one of lock -> clear -> fall -> spawn on successive steps', () => {
    let s = setup(newGame(), 0, parseBoard(germRow), active);
    s = tick(s, 1000); // lock
    let p = player(s, 0);
    expect(p.active).toBeNull();
    expect(p.status).toBe('clearing');
    expect(cellAt(p.board, 15, 3)).toMatchObject({ kind: 'half', color: 1, partnerDir: 'up' });
    expect(p.score).toBe(0); // nothing is cleared on the lock step itself

    s = tick(s, 1000); // clear
    p = player(s, 0);
    expect(p.score).toBe(300);
    expect(p.germsLeft).toBe(1);
    expect(cellAt(p.board, 15, 0)?.kind).toBe('empty');
    // the surviving half of the capsule is split off and still hangs where it was
    expect(cellAt(p.board, 14, 3)).toEqual({ kind: 'half', color: 2, partnerDir: null });
    expect(p.active).toBeNull();

    s = tick(s, 1000); // fall
    p = player(s, 0);
    expect(cellAt(p.board, 14, 3)?.kind).toBe('empty');
    expect(cellAt(p.board, 15, 3)).toEqual({ kind: 'half', color: 2, partnerDir: null });
    expect(p.active).toMatchObject({ row: 0, col: 3 }); // stable, so the next capsule spawned
    expect(eventTypes(s).filter((t) => ['lock', 'clear', 'fall'].includes(t))).toEqual([
      'lock',
      'clear',
      'fall',
    ]);
  });

  it('cascades one step at a time and applies the cascade multiplier', () => {
    const rows = ['.......C', '........', '........', '........', '........', 'AAA.BBB.'];
    let s = setup(newGame(), 0, parseBoard(rows), active);
    s = tick(s, 1000); // lock
    s = tick(s, 1000); // clear 1: 3 germs x 100
    expect(player(s, 0).score).toBe(300);
    expect(player(s, 0).cascadeIndex).toBe(1);
    s = tick(s, 1000); // the split half falls into (15,3)
    expect(player(s, 0).score).toBe(300);
    expect(player(s, 0).status).toBe('clearing'); // a new run of 4 is waiting
    expect(player(s, 0).active).toBeNull();
    s = tick(s, 1000); // clear 2: 3 germs x 200
    const p = player(s, 0);
    expect(p.score).toBe(900);
    expect(p.stats.maxCascade).toBe(1);
    expect(p.stats.germsCleared).toBe(6);
    expect(eventTypes(s)).toContain('cascade');
    const clear2 = s.events.filter((e) => e.type === 'clear').at(-1);
    expect(clear2).toMatchObject({ cascadeIndex: 1 });
    expect(p.active).toMatchObject({ row: 0, col: 3 });
  });

  it('a lock resets the cascade counter', () => {
    let s = setup(newGame(), 0, parseBoard(germRow), active);
    for (let i = 0; i < 3; i++) s = tick(s, 1000);
    expect(player(s, 0).cascadeIndex).toBe(1);
    s = input(s, 'hard-drop');
    expect(player(s, 0).cascadeIndex).toBe(0);
  });

  it('scores by speed factor', () => {
    for (const [speed, expected] of [
      ['low', 300],
      ['med', 450],
      ['hi', 600],
    ] as const) {
      let s = newGame({ speeds: [speed, speed] });
      s = setup(s, 0, parseBoard(germRow), active);
      const ms = player(s, 0).gravityMs;
      s = tick(s, ms);
      s = tick(s, ms);
      expect(player(s, 0).score).toBe(expected);
    }
  });

  it('a split half and a vertical capsule fall when the support under them is cleared', () => {
    const board = flat();
    // germs 1 1 1 on row 15 and a vertical capsule standing on the 4th cell
    setCell(board, 15, 3, { kind: 'half', color: 1, partnerDir: null });
    for (const c of [0, 1, 2]) setCell(board, 15, c, { kind: 'germ', color: 1 });
    lockCapsule(board, { row: 14, col: 3, orientation: 'v', colors: [3, 3] });
    setCell(board, 10, 7, { kind: 'germ', color: 2 });
    let s = setup(newGame(), 0, board, null);
    s = tick(s, 1000); // clear the run of four along row 15
    const cleared = player(s, 0).board;
    expect(cellAt(cleared, 15, 3)?.kind).toBe('empty');
    expect(cellAt(cleared, 14, 3)).toMatchObject({ partnerDir: 'up' });
    s = tick(s, 1000); // the whole vertical capsule falls one row
    const fallen = player(s, 0).board;
    expect(cellAt(fallen, 15, 3)).toMatchObject({ kind: 'half', color: 3, partnerDir: 'up' });
    expect(cellAt(fallen, 14, 3)).toMatchObject({ kind: 'half', color: 3, partnerDir: 'down' });
  });

  it('keeps all cells inside the board across a long random game (no column -1 writes)', () => {
    const script = createRng(77);
    let s = newGame({ seed: 5, levels: [10, 10], mode: '2p', speeds: ['hi', 'hi'] });
    const keys: PuzzleInput[] = ['left', 'right', 'down', 'rotate-cw', 'rotate-ccw', 'hard-drop'];
    for (let i = 0; i < 800 && s.status === 'playing'; i++) {
      const k = keys[Math.floor(script() * keys.length)] ?? 'left';
      s = input(s, k, Math.floor(script() * 2));
      s = tick(s, 100 + Math.floor(script() * 400));
      for (const p of s.players) {
        expect(p.board).toHaveLength(ROWS);
        for (const row of p.board) expect(row).toHaveLength(COLS);
      }
    }
  });
});

describe('top-out', () => {
  it('tops out at spawn when a spawn cell is occupied (1P ends the match)', () => {
    const created = reducePuzzle(createPuzzleState(), {
      type: 'NEW_MATCH',
      mode: '1p',
      levels: [3],
      speeds: ['low'],
      seed: 4,
    });
    const blocked = withPlayer(created, 0, {
      board: (() => {
        const b = flat();
        setCell(b, 0, 4, { kind: 'half', color: 3, partnerDir: null });
        return b;
      })(),
    });
    const s = reducePuzzle(blocked, { type: 'START_ROUND' });
    expect(player(s, 0).status).toBe('topped-out');
    expect(player(s, 0).active).toBeNull();
    expect(s.status).toBe('match-over');
    expect(s.roundWinner).toBeNull();
    expect(eventTypes(s)).toContain('top-out');
    expect(tick(s, 1000)).toBe(s);
  });

  it('tops out after a capsule locks across the spawn cells', () => {
    const board = flat();
    for (let r = 1; r < ROWS; r++) {
      const odd = r % 2 === 1;
      setCell(board, r, 3, { kind: 'half', color: odd ? 1 : 2, partnerDir: null });
      setCell(board, r, 4, { kind: 'half', color: odd ? 2 : 1, partnerDir: null });
    }
    setCell(board, 10, 0, { kind: 'germ', color: 3 });
    let s = setup(newGame(), 0, board, { row: 0, col: 3, orientation: 'h', colors: [3, 3] });
    s = tick(s, 1000);
    expect(player(s, 0).status).toBe('topped-out');
    expect(s.status).toBe('match-over');
    expect(cellAt(player(s, 0).board, 0, 3)?.kind).toBe('half');
  });
});

describe('pause', () => {
  it('stops ticks and input until resumed', () => {
    let s = newGame();
    s = setup(s, 0, flat(), horizontalAt(0, 3));
    const paused = reducePuzzle(s, { type: 'PAUSE' });
    expect(paused.status).toBe('paused');
    expect(tick(paused, 10_000)).toBe(paused);
    expect(input(paused, 'left')).toBe(paused);
    expect(reducePuzzle(paused, { type: 'PAUSE' })).toBe(paused);
    const resumed = reducePuzzle(paused, { type: 'RESUME' });
    expect(resumed.status).toBe('playing');
    expect(player(tick(resumed, 1000), 0).active?.row).toBe(1);
    expect(eventTypes(resumed).slice(-2)).toEqual(['paused', 'resumed']);
  });
});

describe('level progression (1P)', () => {
  const clearingBoard = ['........', '........', '........', '........', '........', 'AAA.....'];
  it('awards the level bonus, then NEXT_ROUND raises the level and builds a new board', () => {
    let s = newGame({ levels: [1, 1] });
    s = setup(s, 0, parseBoard(clearingBoard), { row: 15, col: 3, orientation: 'v', colors: [1, 2] });
    s = tick(s, 1000); // lock
    s = tick(s, 1000); // clear: last germs
    expect(player(s, 0).status).toBe('cleared');
    expect(s.status).toBe('round-over');
    expect(s.roundWinner).toBe(0);
    expect(player(s, 0).score).toBe(300 + 1000);
    expect(eventTypes(s)).toEqual(expect.arrayContaining(['level-clear', 'round-won']));
    expect(tick(s, 1000)).toBe(s);

    const next = reducePuzzle(s, { type: 'NEXT_ROUND' });
    expect(next.status).toBe('idle');
    expect(next.round).toBe(2);
    const p = player(next, 0);
    expect(p.level).toBe(2);
    expect(p.germsLeft).toBe(2);
    expect(p.score).toBe(1300);
    expect(p.active).toBeNull();
    const again = reducePuzzle(next, { type: 'START_ROUND' });
    expect(again.status).toBe('playing');
    expect(player(again, 0).active).not.toBeNull();
  });

  it('caps the level at 20', () => {
    let s = newGame({ levels: [20, 20] });
    s = setup(s, 0, parseBoard(clearingBoard), { row: 15, col: 3, orientation: 'v', colors: [1, 2] });
    s = tick(tick(s, 1000), 1000);
    expect(player(s, 0).score).toBe(300 + 20_000);
    const next = reducePuzzle(s, { type: 'NEXT_ROUND' });
    expect(player(next, 0).level).toBe(20);
  });
});

describe('events', () => {
  it('have strictly increasing seq numbers and are capped', () => {
    let s = newGame({ mode: '2p', levels: [3, 3], speeds: ['hi', 'hi'] });
    const script = createRng(8);
    for (let i = 0; i < 300 && s.status === 'playing'; i++) {
      s = tick(s, 200 + Math.floor(script() * 300));
      s = input(s, script() < 0.5 ? 'hard-drop' : 'left', Math.floor(script() * 2));
    }
    const seqs = s.events.map((e) => e.seq);
    expect(seqs.length).toBeGreaterThan(10);
    expect(seqs.length).toBeLessThanOrEqual(128);
    for (let i = 1; i < seqs.length; i++) expect(seqs[i]).toBeGreaterThan(seqs[i - 1] ?? 0);
    expect(s.nextSeq).toBe((seqs.at(-1) ?? 0) + 1);
  });
});

describe('determinism', () => {
  function run(seed: number): string {
    const script = createRng(1000 + seed);
    let s = newGame({ seed, mode: '2p', levels: [6, 9], speeds: ['hi', 'med'] });
    const keys: PuzzleInput[] = ['left', 'right', 'down', 'rotate-cw', 'rotate-ccw', 'hard-drop'];
    for (let i = 0; i < 600; i++) {
      if (s.status === 'round-over') s = reducePuzzle(s, { type: 'NEXT_ROUND' });
      else if (s.status === 'idle') s = reducePuzzle(s, { type: 'START_ROUND' });
      if (s.status === 'match-over') break;
      const r = script();
      if (r < 0.6) s = tick(s, 30 + Math.floor(script() * 700));
      else s = input(s, keys[Math.floor(script() * keys.length)] ?? 'left', Math.floor(script() * 2));
    }
    return JSON.stringify(s);
  }

  it('two runs from the same seed and input script produce identical JSON', () => {
    const a = run(21);
    const b = run(21);
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(1000);
    const parsed = JSON.parse(a) as MatchState;
    expect(parsed.nextSeq).toBeGreaterThan(40);
  });

  it('different seeds diverge', () => {
    expect(run(21)).not.toBe(run(22));
  });

  it('state round-trips through JSON and keeps playing identically', () => {
    let s = newGame({ seed: 3, levels: [4, 4], mode: '2p' });
    s = tick(s, 3000);
    const revived = JSON.parse(JSON.stringify(s)) as MatchState;
    expect(JSON.stringify(tick(revived, 2500))).toBe(JSON.stringify(tick(s, 2500)));
  });
});
