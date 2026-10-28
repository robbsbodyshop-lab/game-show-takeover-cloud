import { describe, expect, it } from 'vitest';
import {
  champion,
  createBracket,
  currentMatch,
  eliminatedTeams,
  isComplete,
  recordMatchWinner,
} from './tournament';
import type { BracketState } from './types';

const seeds = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

/** Play out a bracket always letting team `a` (the better seed side) win. */
function playAll(b: BracketState): { bracket: BracketState; played: number } {
  let bracket = b;
  let played = 0;
  for (let m = currentMatch(bracket); m; m = currentMatch(bracket)) {
    bracket = recordMatchWinner(bracket, m.a ?? 0);
    played++;
  }
  return { bracket, played };
}

describe('createBracket shapes', () => {
  const cases: {
    n: number;
    rounds: number;
    firstRoundMatches: number;
    byes: number;
    playedMatches: number;
  }[] = [
    { n: 2, rounds: 1, firstRoundMatches: 1, byes: 0, playedMatches: 1 },
    { n: 3, rounds: 2, firstRoundMatches: 2, byes: 1, playedMatches: 2 },
    { n: 4, rounds: 2, firstRoundMatches: 2, byes: 0, playedMatches: 3 },
    { n: 5, rounds: 3, firstRoundMatches: 4, byes: 3, playedMatches: 4 },
    { n: 6, rounds: 3, firstRoundMatches: 4, byes: 2, playedMatches: 5 },
    { n: 7, rounds: 3, firstRoundMatches: 4, byes: 1, playedMatches: 6 },
    { n: 8, rounds: 3, firstRoundMatches: 4, byes: 0, playedMatches: 7 },
  ];
  for (const c of cases) {
    it(`${c.n} teams: ${c.rounds} rounds, ${c.byes} byes, ${c.playedMatches} matches to play`, () => {
      const b = createBracket(seeds(c.n));
      expect(b.rounds).toHaveLength(c.rounds);
      expect(b.rounds[0]).toHaveLength(c.firstRoundMatches);
      expect(b.rounds[0]?.filter((m) => m.bye)).toHaveLength(c.byes);
      const { bracket, played } = playAll(b);
      expect(played).toBe(c.playedMatches);
      expect(isComplete(bracket)).toBe(true);
      expect(champion(bracket)).toBe(1); // top seed always wins in playAll
    });
  }

  it('gives byes to the top seeds and none to the others', () => {
    const b = createBracket([10, 20, 30, 40, 50]); // 5 teams, 8 slots: seeds 1-3 get byes
    const byeWinners = b.rounds[0]?.filter((m) => m.bye).map((m) => m.winner);
    expect(byeWinners?.sort()).toEqual([10, 20, 30]);
    const real = b.rounds[0]?.filter((m) => !m.bye);
    expect(real).toHaveLength(1);
    expect([real?.[0]?.a, real?.[0]?.b].sort()).toEqual([40, 50]);
  });

  it('seeds an eight team bracket 1v8 4v5 2v7 3v6 style: seeds 1 and 2 only meet in the final', () => {
    const b = createBracket(seeds(8));
    const firstRound = b.rounds[0]?.map((m) => [m.a, m.b]);
    expect(firstRound).toEqual([
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ]);
  });

  it('three teams: seed 1 waits in the final for the winner of 2 v 3', () => {
    let b = createBracket([7, 8, 9]);
    expect(currentMatch(b)).toMatchObject({ round: 0, a: 8, b: 9 });
    b = recordMatchWinner(b, 9);
    expect(currentMatch(b)).toMatchObject({ round: 1, a: 7, b: 9 });
    expect(eliminatedTeams(b)).toEqual([8]);
    b = recordMatchWinner(b, 7);
    expect(champion(b)).toBe(7);
    expect(currentMatch(b)).toBeNull();
    expect(eliminatedTeams(b)).toEqual([8, 9]);
  });

  it('rejects invalid team counts and duplicate seeds', () => {
    expect(() => createBracket([1])).toThrow(RangeError);
    expect(() => createBracket(seeds(9))).toThrow(RangeError);
    expect(() => createBracket([1, 1, 2])).toThrow(RangeError);
  });
});

describe('recordMatchWinner', () => {
  it('returns the same object for a team not in the current match', () => {
    const b = createBracket(seeds(4));
    expect(recordMatchWinner(b, 3)).toBe(b);
    expect(recordMatchWinner(b, 99)).toBe(b);
  });

  it('returns the same object when the bracket is complete', () => {
    const { bracket } = playAll(createBracket(seeds(3)));
    expect(recordMatchWinner(bracket, 1)).toBe(bracket);
  });

  it('does not mutate the previous bracket', () => {
    const b = createBracket(seeds(4));
    const before = JSON.stringify(b);
    recordMatchWinner(b, 1);
    expect(JSON.stringify(b)).toBe(before);
  });

  it('plays matches round by round in slot order', () => {
    let b = createBracket(seeds(8));
    const order: number[][] = [];
    for (let m = currentMatch(b); m; m = currentMatch(b)) {
      order.push([m.round, m.slot]);
      b = recordMatchWinner(b, m.a ?? 0);
    }
    expect(order).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 0],
      [1, 1],
      [2, 0],
    ]);
  });
});
