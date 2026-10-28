/** One test per bullet of "Solving" in docs/WHEEL_OF_FORTUNE_RULES.md (quoted in the test names). */
import { describe, expect, it } from 'vitest';
import { buildWheel } from './wheels';
import { isCash, run, spinOn, team, toRound } from './testKit';
import { wheelReduce } from './wheelEngine';
import { audienceView, hostView } from './selectors';

describe('Solving', () => {
  it('"Only the solver keeps the round: their round cash plus round prizes are banked"', () => {
    const s0 = toRound(1);
    const bank = team(s0, 1).bank;
    let s = run(
      s0,
      spinOn(s0, isCash(700)),
      { type: 'CALL_LETTER', letter: 'P' },
      { type: 'BUY_VOWEL', letter: 'E' },
    );
    s = patch(s, 1, { roundPrizes: [{ name: 'TRIP', value: 5000 }] });
    s = run(s, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'correct' });
    expect(team(s, 1).bank).toBe(bank + 2100 - 250 + 5000);
    expect(team(s, 1).roundCash).toBe(0);
    expect(s.award).toMatchObject({ team: 1, amount: 2100 - 250 + 5000 });
  });

  it('"... raised to $1,000 if lower."', () => {
    const s0 = toRound(1);
    const s = run(s0, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'correct' });
    expect(team(s, 1).bank - team(s0, 1).bank).toBe(1000);
    const small = patch(s0, 1, { roundCash: 750 });
    const s2 = run(small, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'correct' });
    expect(team(s2, 1).bank - team(s0, 1).bank).toBe(1000);
  });

  it('"Everyone else\'s round money and prizes are erased. Banked money is never at risk."', () => {
    let s = toRound(1);
    const banks = s.teams.map((t) => t.bank);
    s = patch(s, 2, { roundCash: 4000, roundPrizes: [{ name: 'TRIP', value: 5000 }] });
    s = patch(s, 3, { roundCash: 100 });
    s = run(s, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'correct' });
    expect(s.teams.map((t) => [t.roundCash, t.roundPrizes.length])).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
    ]);
    expect(team(s, 2).bank).toBe(banks[1]);
    expect(team(s, 3).bank).toBe(banks[2]);
  });

  it('the Prize Puzzle (Round 3): the solver also wins the trip', () => {
    const s0 = toRound(3);
    const s = run(s0, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'correct' });
    expect(s.award?.prizes).toEqual([{ name: 'A TRIP TO MAUI', value: 9800 }]);
    expect(team(s, s0.turn!).prizes).toEqual(['A TRIP TO MAUI']);
    expect(team(s, s0.turn!).bank - team(s0, s0.turn!).bank).toBe(9800);
  });

  it('a solve can be cancelled and play resumes where it was', () => {
    const s0 = toRound(1);
    const s = run(
      s0,
      spinOn(s0, isCash(700)),
      { type: 'CALL_LETTER', letter: 'P' },
      { type: 'SOLVE_START' },
      { type: 'SOLVE_CANCEL' },
    );
    expect(s.phase).toBe('choose');
    expect(s.turn).toBe(1);
    expect(wheelReduce(s, { type: 'SOLVE_CANCEL' })).toBe(s);
  });

  it('the solved puzzle lights completely and the award card waits for CONTINUE', () => {
    const s = run(toRound(1), { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'correct' });
    expect(s.phase).toBe('round-award');
    expect(s.puzzle?.shown.every(Boolean)).toBe(true);
    expect(s.puzzle?.queue).toEqual([]);
  });

  it('"The host can overrule the app either way": ruling a solve right or wrong through HOST_SOLVE_OVERRIDE while it is open', () => {
    const s0 = toRound(1);
    const right = run(s0, { type: 'SOLVE_START' }, { type: 'HOST_SOLVE_OVERRIDE', verdict: 'correct' });
    expect(right.phase).toBe('round-award');
    const wrong = run(s0, { type: 'SOLVE_START' }, { type: 'HOST_SOLVE_OVERRIDE', verdict: 'wrong' });
    expect(wrong.turn).toBe(2);
    expect(wheelReduce(s0, { type: 'HOST_SOLVE_OVERRIDE', verdict: 'wrong' })).toBe(s0);
  });

  it('"When the host reverses a right ruling ... a puzzle still in play is thrown out and a replacement comes up; the turn and the money stay (the turn passes on as after any wrong solve)"', () => {
    const s0 = toRound(1);
    let s = run(s0, spinOn(s0, isCash(700)), { type: 'CALL_LETTER', letter: 'P' });
    const correct = run(s, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'correct' });
    expect(correct.phase).toBe('round-award');
    expect(hostView(correct).reversibleRuling).toEqual({ team: 1, verdict: 'correct' });
    s = run(correct, { type: 'HOST_SOLVE_OVERRIDE', verdict: 'wrong' });
    expect(s.phase).toBe('choose');
    expect(s.stage).toBe('round');
    expect(s.turn).toBe(2);
    expect(s.puzzle?.puzzle.phrase).toBe('SPARE PUZZLE');
    expect(s.puzzle?.called).toEqual([]);
    expect(team(s, 1).roundCash).toBe(2100); // the money stays
    expect(team(s, 1).bank).toBe(team(s0, 1).bank); // nothing banked
    expect(s.award).toBeNull();
  });

  it('the reversal of a wrong ruling gives the solve to the team (the puzzle is not thrown out)', () => {
    const s0 = toRound(1);
    const wrong = run(s0, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'wrong' });
    expect(wrong.turn).toBe(2);
    const s = run(wrong, { type: 'HOST_SOLVE_OVERRIDE', verdict: 'correct' });
    expect(s.phase).toBe('round-award');
    expect(s.award?.team).toBe(1);
    expect(s.puzzle?.puzzle.phrase).toBe('RED APPLE PIE');
  });

  it('a ruling can be reversed only while nothing else has been done', () => {
    const s0 = toRound(1);
    const wrong = run(s0, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'wrong' });
    const moved = run(wrong, { type: 'SKIP_TURN' });
    expect(wheelReduce(moved, { type: 'HOST_SOLVE_OVERRIDE', verdict: 'correct' })).toBe(moved);
    // the same verdict is not a reversal
    expect(wheelReduce(wrong, { type: 'HOST_SOLVE_OVERRIDE', verdict: 'wrong' })).toBe(wrong);
    // presentation steps (lighting) do not stop a reversal
    const lit = run(wrong, { type: 'LIGHT_NEXT' });
    expect(wheelReduce(lit, { type: 'HOST_SOLVE_OVERRIDE', verdict: 'correct' })).not.toBe(lit);
  });

  it('reversing a right Express solve is a wrong solve: a Bankrupt, then the puzzle is thrown out', () => {
    const s0 = toRound(3);
    const me = s0.turn!;
    let s = run(
      s0,
      spinOn(s0, (w) => w.kind === 'express'),
      { type: 'CALL_LETTER', letter: 'R' },
      { type: 'EXPRESS', choice: 'play' },
    );
    s = run(
      s,
      { type: 'SOLVE_START' },
      { type: 'SOLVE', verdict: 'correct' },
      { type: 'HOST_SOLVE_OVERRIDE', verdict: 'wrong' },
    );
    expect(team(s, me).roundCash).toBe(0);
    expect(s.turn).not.toBe(me);
    expect(s.puzzle?.puzzle.phrase).not.toBe('RED APPLE PIE');
  });

  it('judging helpers do not leak: the audience view stays hidden until the solve lights the board', () => {
    const s0 = toRound(1);
    expect(JSON.stringify(audienceView(s0))).not.toContain('APPLE');
    const solved = run(s0, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'correct' });
    const tiles =
      audienceView(solved)
        .board?.flat()
        .filter((c) => c.kind === 'tile') ?? [];
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((c) => c.lit && c.char !== null)).toBe(true);
    expect(buildWheel(1)).toHaveLength(24);
  });
});

function patch(
  s: ReturnType<typeof toRound>,
  id: number,
  p: Partial<ReturnType<typeof toRound>['teams'][number]>,
) {
  return { ...s, teams: s.teams.map((t) => (t.id === id ? { ...t, ...p } : t)) };
}
