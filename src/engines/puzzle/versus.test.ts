import { describe, expect, it } from 'vitest';
import { cellAt, createEmptyBoard } from './board';
import type { Run } from './board';
import { createPuzzleState, reducePuzzle } from './puzzleEngine';
import { createRng } from './rng';
import { eventTypes, newGame, parseBoard, player, setup, tick, withPlayer } from './testHelpers';
import type { Color, MatchState, Pt } from './types';
import { dropGarbage, garbageForRuns, hasWonMatch, pickGarbageColumns } from './versus';

const run = (color: Color, hasGerm: boolean): Run => ({
  color,
  orientation: 'h',
  cells: [] as Pt[],
  hasGerm,
});

describe('garbage rule', () => {
  it('sends nothing for a single germ run or for runs without germs', () => {
    expect(garbageForRuns([])).toEqual([]);
    expect(garbageForRuns([run(1, true)])).toEqual([]);
    expect(garbageForRuns([run(1, true), run(2, false)])).toEqual([]);
    expect(garbageForRuns([run(1, false), run(2, false)])).toEqual([]);
  });

  it('sends one half per germ run in the run colours, at most 4', () => {
    expect(garbageForRuns([run(1, true), run(3, true)])).toEqual([1, 3]);
    expect(garbageForRuns([run(2, true), run(2, true), run(1, true)])).toEqual([2, 2, 1]);
    expect(garbageForRuns([1, 2, 3, 1, 2, 3].map((c) => run(c as Color, true)))).toEqual([1, 2, 3, 1]);
    expect(garbageForRuns([run(1, true), run(2, false), run(3, true)])).toEqual([1, 3]);
  });

  it('picks distinct columns inside the board, deterministically', () => {
    for (let seed = 0; seed < 50; seed++) {
      const cols = pickGarbageColumns(4, createRng(seed));
      expect(new Set(cols).size).toBe(4);
      for (const c of cols) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThan(8);
      }
    }
    expect(pickGarbageColumns(3, createRng(9))).toEqual(pickGarbageColumns(3, createRng(9)));
    expect(pickGarbageColumns(20, createRng(1))).toHaveLength(8);
  });

  it('drops lone halves at row 0 and skips a column whose top cell is taken', () => {
    const board = parseBoard(['.A......']);
    board[0]?.splice(2, 1, { kind: 'half', color: 3, partnerDir: null });
    const placed = dropGarbage(board, [1, 2, 3], [1, 5, 2]);
    expect(placed.map((p) => p.col)).toEqual([1, 5]);
    expect(cellAt(board, 0, 1)).toEqual({ kind: 'half', color: 1, partnerDir: null });
    expect(cellAt(board, 0, 5)).toEqual({ kind: 'half', color: 2, partnerDir: null });
    expect(cellAt(board, 0, 2)).toEqual({ kind: 'half', color: 3, partnerDir: null });
  });

  it('match target is 3 round wins', () => {
    expect(hasWonMatch(2)).toBe(false);
    expect(hasWonMatch(3)).toBe(true);
  });
});

describe('versus play', () => {
  // One vertical capsule [1,2] completes a colour-2 run on row 14 and a colour-1 run on row 15.
  const twoRuns = parseBoard(['.......C', '........', '........', '........', 'BBB.....', 'AAA.....']);

  function twoRunClear(): MatchState {
    let s = newGame({ mode: '2p', levels: [5, 5], speeds: ['low', 'low'], seed: 11 });
    s = setup(s, 0, twoRuns, { row: 15, col: 3, orientation: 'v', colors: [1, 2] });
    s = tick(s, 1000); // lock (player 1 also falls one row)
    return tick(s, 1000); // clear both runs in one step
  }

  it('clearing two germ runs in one step queues min(runs, 4) halves for the opponent', () => {
    const s = twoRunClear();
    expect(player(s, 0).score).toBe(600);
    expect(player(s, 1).pendingGarbage).toEqual([2, 1]); // scan order: row 14 first, then row 15
    expect(player(s, 0).stats.garbageSent).toBe(2);
    expect(s.events.find((e) => e.type === 'garbage-sent')).toMatchObject({
      player: 0,
      to: 1,
      colors: [2, 1],
    });
  });

  it('a single germ run sends nothing', () => {
    const board = parseBoard(['.......C', '........', '........', '........', '........', 'AAA.....']);
    let s = newGame({ mode: '2p', levels: [5, 5], seed: 11 });
    s = setup(s, 0, board, { row: 15, col: 3, orientation: 'v', colors: [1, 2] });
    s = tick(tick(s, 1000), 1000);
    expect(player(s, 1).pendingGarbage).toEqual([]);
    expect(eventTypes(s)).not.toContain('garbage-sent');
  });

  it('garbage drops from the top into distinct columns on the receiver’s next lock', () => {
    let s = twoRunClear();
    s = setup(s, 1, createEmptyBoard(), { row: 3, col: 3, orientation: 'h', colors: [3, 3] });
    s = withPlayer(s, 1, { pendingGarbage: [2, 1, 3, 3] });
    // not delivered while the receiver's capsule is still falling
    expect(player(tick(s, 1000), 1).pendingGarbage).toEqual([2, 1, 3, 3]);
    const locked = reducePuzzle(s, { type: 'INPUT', player: 1, input: 'hard-drop' });
    const p = player(locked, 1);
    expect(p.pendingGarbage).toEqual([]);
    expect(p.stats.garbageReceived).toBe(4);
    const received = locked.events.find((e) => e.type === 'garbage-received');
    expect(received).toBeDefined();
    if (received?.type === 'garbage-received') {
      expect(new Set(received.columns).size).toBe(4);
      expect(received.colors).toEqual([2, 1, 3, 3]);
      received.columns.forEach((col, i) => {
        expect(cellAt(p.board, 0, col)).toEqual({
          kind: 'half',
          color: received.colors[i],
          partnerDir: null,
        });
      });
    }
    // the halves then fall as loose pieces, one row per step, before the next capsule spawns
    expect(p.active).toBeNull();
    const after = tick(locked, 1000);
    expect(player(after, 1).board[1]?.filter((c) => c.kind === 'half').length).toBe(4);
  });

  it('is deterministic: the same seed delivers the same garbage columns', () => {
    const drop = (): string => {
      let s = twoRunClear();
      s = setup(s, 1, createEmptyBoard(), { row: 3, col: 3, orientation: 'h', colors: [3, 3] });
      s = withPlayer(s, 1, { pendingGarbage: [1, 2] });
      return JSON.stringify(reducePuzzle(s, { type: 'INPUT', player: 1, input: 'hard-drop' }));
    };
    expect(drop()).toBe(drop());
  });
});

describe('versus rounds and match', () => {
  function toppedOut(s: MatchState, loser: number): MatchState {
    const board = createEmptyBoard();
    board[0]?.splice(3, 1, { kind: 'half', color: 1, partnerDir: null });
    return withPlayer(s, loser, { board });
  }

  function playRound(s: MatchState, loser: number): MatchState {
    const idle = s.status === 'idle' ? s : reducePuzzle(s, { type: 'NEXT_ROUND' });
    return reducePuzzle(toppedOut(idle, loser), { type: 'START_ROUND' });
  }

  it('opponent top-out ends the round for the other player', () => {
    const playing = newGame({ mode: '2p', levels: [2, 2] });
    expect(reducePuzzle(playing, { type: 'NEXT_ROUND' })).toBe(playing); // illegal while playing
    const idle = newGameIdle();
    const s = playRound(idle, 0);
    expect(player(s, 0).status).toBe('topped-out');
    expect(s.status).toBe('round-over');
    expect(s.roundWinner).toBe(1);
    expect(s.roundWins).toEqual([0, 1]);
    expect(eventTypes(s)).toEqual(expect.arrayContaining(['top-out', 'round-won']));
  });

  it('clearing every germ wins the round', () => {
    let s = newGame({ mode: '2p', levels: [1, 1], speeds: ['low', 'low'] });
    s = setup(s, 1, parseBoard(['........', 'AAA.....']), {
      row: 15,
      col: 3,
      orientation: 'v',
      colors: [1, 2],
    });
    s = tick(tick(s, 1000), 1000);
    expect(player(s, 1).status).toBe('cleared');
    expect(s.status).toBe('round-over');
    expect(s.roundWins).toEqual([0, 1]);
    expect(s.roundWinner).toBe(1);
    expect(player(s, 1).score).toBe(300 + 1000);
  });

  it('NEXT_ROUND replays the same levels with fresh boards and keeps round wins', () => {
    const s = playRound(newGameIdle([4, 6]), 0);
    const next = reducePuzzle(s, { type: 'NEXT_ROUND' });
    expect(next.status).toBe('idle');
    expect(next.round).toBe(2);
    expect(next.roundWins).toEqual([0, 1]);
    expect(next.roundWinner).toBeNull();
    expect(next.players.map((p) => p.level)).toEqual([4, 6]);
    expect(next.players.map((p) => p.germsLeft)).toEqual([4, 6]);
    expect(next.players.every((p) => p.active === null && p.pendingGarbage.length === 0)).toBe(true);
  });

  it('first to 3 round wins takes the match; nothing further is accepted', () => {
    let s = newGameIdle();
    s = playRound(s, 0); // P1 (index 1) wins round 1
    s = playRound(s, 1); // index 0 wins
    expect(s.roundWins).toEqual([1, 1]);
    expect(s.status).toBe('round-over');
    s = playRound(s, 0);
    expect(s.roundWins).toEqual([1, 2]);
    expect(s.status).toBe('round-over');
    s = playRound(s, 0);
    expect(s.roundWins).toEqual([1, 3]);
    expect(s.status).toBe('match-over');
    expect(s.matchWinner).toBe(1);
    expect(eventTypes(s)).toContain('match-won');
    expect(reducePuzzle(s, { type: 'NEXT_ROUND' })).toBe(s);
    expect(tick(s, 1000)).toBe(s);
  });
});

function newGameIdle(levels: number[] = [2, 2]): MatchState {
  return reducePuzzle(createPuzzleState(), {
    type: 'NEW_MATCH',
    mode: '2p',
    levels,
    speeds: ['low', 'low'],
    seed: 31,
  });
}
