/** One test per bullet of "Episode structure" in docs/WHEEL_OF_FORTUNE_RULES.md (quoted in the test names). */
import { describe, expect, it } from 'vitest';
import { buildPlan } from './plan';
import { DEFAULT_WHEEL_SETTINGS } from './types';
import type { WheelSettings, WheelState } from './types';
import { createWheelState, wheelReduce } from './wheelEngine';
import { TEAMS, autoplay, newGame, provide, run, solveTossup, spinOn, team, toRound } from './testKit';
import { isCash } from './testKit';

const kinds = (settings: Partial<WheelSettings>): string[] =>
  buildPlan({ ...DEFAULT_WHEEL_SETTINGS, ...settings }).map((s) =>
    s.kind === 'round' ? `round${s.round}` : s.kind === 'tossup' ? `tossup${s.value}` : s.kind,
  );

/** The sequence of stages a game goes through, as it plays out. */
function sequence(settings: Partial<WheelSettings>): string[] {
  const seen: string[] = [];
  const note = (st: WheelState) => {
    const label =
      st.stage === 'round'
        ? `round${st.round}`
        : st.stage === 'tossup'
          ? `tossup${st.tossup?.value}`
          : st.stage;
    if (seen[seen.length - 1] !== label) seen.push(label);
  };
  const start = newGame(settings);
  note(start);
  autoplay(start, (st) => st.stage === 'bonus' || st.stage === 'game-over', note);
  return seen;
}

describe('Episode structure: the plan', () => {
  it('"Opening toss-ups ... Classic: a $1,000 Toss-Up, then a $2,000 Toss-Up", Rounds 1-3, Triple Toss-Up, Round 4, Bonus Round', () => {
    expect(kinds({})).toEqual([
      'tossup1000',
      'tossup2000',
      'round1',
      'round2',
      'round3',
      'triple',
      'round4',
      'finale',
      'bonus',
    ]);
  });

  it('"Fortune Frenzy (Season 44)" replaces the two opening toss-ups', () => {
    expect(kinds({ opening: 'frenzy' })).toEqual([
      'frenzy',
      'round1',
      'round2',
      'round3',
      'triple',
      'round4',
      'finale',
      'bonus',
    ]);
  });

  it('"a host setting can start Round 4 as the Speed-Up"', () => {
    expect(kinds({ speedUpStart: 'round4' })).toEqual([
      'tossup1000',
      'tossup2000',
      'round1',
      'round2',
      'round3',
      'triple',
      'speedup',
      'finale',
      'bonus',
    ]);
  });

  it('"The short format plays one $2,000 toss-up (or Fortune Frenzy), Rounds 1 and 2, then a $5,000 round that opens as the Speed-Up, then the Bonus Round"', () => {
    expect(kinds({ length: 'short' })).toEqual([
      'tossup2000',
      'round1',
      'round2',
      'speedup',
      'finale',
      'bonus',
    ]);
    expect(kinds({ length: 'short', opening: 'frenzy' })).toEqual([
      'frenzy',
      'round1',
      'round2',
      'speedup',
      'finale',
      'bonus',
    ]);
  });

  it('"Bonus Round for the team with the highest total (a host setting can leave it out)"', () => {
    expect(kinds({ bonusRound: false })).not.toContain('bonus');
    expect(kinds({ bonusRound: false, length: 'short' })).toEqual([
      'tossup2000',
      'round1',
      'round2',
      'speedup',
      'finale',
    ]);
  });

  it('only Round 3 is the Prize Puzzle', () => {
    const prize = buildPlan(DEFAULT_WHEEL_SETTINGS).filter((s) => s.kind === 'round' && s.prize);
    expect(prize).toEqual([{ kind: 'round', round: 3, prize: true }]);
  });
});

describe('Episode structure: a game played out', () => {
  it('runs the full show in order: toss-ups, Rounds 1-3, Triple Toss-Up, Round 4, then the Speed-Up (every game ends in one)', () => {
    expect(sequence({})).toEqual([
      'tossup1000',
      'tossup2000',
      'round1',
      'round2',
      'round3',
      'triple',
      'round4',
      'speedup',
      'bonus',
    ]);
  });

  it('runs the short show', () => {
    expect(sequence({ length: 'short' })).toEqual(['tossup2000', 'round1', 'round2', 'speedup', 'bonus']);
  });

  it('runs Fortune Frenzy as the opening', () => {
    const s0 = newGame({ opening: 'frenzy' });
    let s = run(s0, { type: 'TOSSUP_REVEAL_NEXT', draw: 0 }, { type: 'FRENZY_TICK', ms: 30000 });
    s = autoplay(s, (st) => st.stage === 'round');
    expect(s.stage).toBe('round');
    expect(s.round).toBe(1);
  });

  it('"Round 4 ... a host setting can start Round 4 as the Speed-Up": no plain Round 4 is played', () => {
    expect(sequence({ speedUpStart: 'round4' })).toEqual([
      'tossup1000',
      'tossup2000',
      'round1',
      'round2',
      'round3',
      'triple',
      'speedup',
      'bonus',
    ]);
  });

  it('"Round 2 starts with the team after the Round 1 starter, Round 3 with the team after that."', () => {
    const starters: number[] = [];
    const s0 = newGame();
    let lastRound = 0;
    autoplay(
      s0,
      (st) => st.round === 4,
      (st) => {
        if (st.stage === 'round' && st.phase === 'choose' && st.round !== lastRound) {
          lastRound = st.round;
          starters.push(st.turn ?? -1);
        }
      },
    );
    // team 1 won the deciding toss-up and starts Round 1; the rotation continues from the starter
    expect(starters.slice(0, 3)).toEqual([1, 2, 3]);
  });

  it('"The winner of the $2,000 toss-up starts Round 1" (not the winner of the $1,000 one)', () => {
    let s = newGame();
    s = solveTossup(s, 3);
    s = autoplay(s, (st) => st.phase === 'tossup-reveal' && st.tossup?.value === 2000);
    s = solveTossup(s, 2);
    s = autoplay(s, (st) => st.stage === 'round' && st.phase === 'choose');
    expect(s.turn).toBe(2);
  });

  it('Round 1 uses the $2,500 wheel and Round 4 the $5,000 wheel', () => {
    const r1 = toRound(1);
    const top1 = run(r1, { type: 'SPIN', draw: 0.001 }, { type: 'CALL_LETTER', letter: 'D' });
    expect(team(top1, 1).roundCash).toBe(2500);
    const r2 = toRound(2);
    const top2 = run(r2, { type: 'SPIN', draw: 0.001 }, { type: 'CALL_LETTER', letter: 'D' });
    expect(team(top2, r2.turn ?? 0).roundCash).toBe(3500);
  });

  it('Round 3 asks for a Prize Puzzle', () => {
    let s = toRound(2);
    s = run(s, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'correct' }, { type: 'CONTINUE' });
    expect(s.request).toEqual({ use: 'prize', count: 2 });
  });

  it('puzzles come from PROVIDE_PUZZLES; nothing else advances while the engine waits', () => {
    const s = createWheelState({ teams: TEAMS });
    expect(s.phase).toBe('awaiting-puzzles');
    expect(s.request).toEqual({ use: 'tossup', count: 2 });
    expect(wheelReduce(s, { type: 'CONTINUE' })).toBe(s);
    expect(wheelReduce(s, { type: 'BUZZ', team: 1, at: 1 })).toBe(s);
    expect(wheelReduce(s, { type: 'PROVIDE_PUZZLES', puzzles: [] })).toBe(s);
    const started = provide(s);
    expect(started.phase).toBe('tossup-reveal');
    expect(wheelReduce(started, { type: 'PROVIDE_PUZZLES', puzzles: [] })).toBe(started);
  });

  it('a puzzle that does not fit the board is not accepted', () => {
    const s = createWheelState({ teams: TEAMS });
    const bad = {
      id: 'bad',
      category: 'X',
      phrase: 'THIS PHRASE IS FAR TOO LONG FOR ONE LINE',
      use: ['tossup' as const],
    };
    expect(wheelReduce(s, { type: 'PROVIDE_PUZZLES', puzzles: [bad] })).toBe(s);
  });

  it('the engine needs at least one team', () => {
    expect(() => createWheelState({ teams: [] })).toThrow();
  });
});

describe('Episode structure: Round 4, the bell and the Speed-Up', () => {
  it('"The host rings the time bell to turn it into the Speed-Up": mid-round it takes effect at the next choice point', () => {
    let s = toRound(4);
    s = run(s, spinOn(s, isCash(700)));
    s = run(s, { type: 'RING_BELL' });
    expect(s.stage).toBe('round'); // mid-spin: wait for the next choice point
    expect(s.bell).toBe(true);
    s = run(s, { type: 'CALL_LETTER', letter: 'P' });
    expect(s.stage).toBe('speedup');
    expect(s.phase).toBe('speedup-spin');
    expect(s.bell).toBe(false);
    expect(s.plan.map((p) => p.kind).slice(-3)).toEqual(['speedup', 'finale', 'bonus']);
  });

  it('ringing the bell between rounds makes the next round the Speed-Up (the rest of the show is skipped)', () => {
    let s = toRound(1);
    s = run(s, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'correct' }, { type: 'RING_BELL' });
    expect(s.stage).toBe('round');
    s = run(s, { type: 'CONTINUE' });
    expect(s.stage).toBe('speedup');
    expect(s.request).toEqual({ use: 'round', count: 2 });
    expect(s.plan.slice(s.planIndex).map((p) => p.kind)).toEqual(['speedup', 'finale', 'bonus']);
  });

  it('"The host can ring the bell early in any round to finish sooner."', () => {
    let s = toRound(1);
    s = run(s, { type: 'RING_BELL' });
    expect(s.stage).toBe('speedup');
    expect(s.plan.map((p) => p.kind).slice(s.planIndex)).toEqual(['speedup', 'finale', 'bonus']);
    // ringing again in the Speed-Up does nothing
    expect(wheelReduce(s, { type: 'RING_BELL' })).toBe(s);
  });

  it('the bell during a toss-up applies to the first round', () => {
    let s = run(newGame(), { type: 'RING_BELL' });
    expect(s.bell).toBe(true);
    s = autoplay(s, (st) => st.stage === 'speedup');
    expect(s.stage).toBe('speedup');
    expect(s.plan.map((p) => p.kind)).not.toContain('triple');
  });

  it('"If Round 4 is solved before the bell, one more $5,000 round opens as the Speed-Up (app choice)."', () => {
    let s = toRound(4);
    s = run(s, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'correct' });
    expect(s.plan.slice(s.planIndex).map((p) => p.kind)).toEqual(['round', 'speedup', 'finale', 'bonus']);
    s = run(s, { type: 'CONTINUE' });
    expect(s.stage).toBe('speedup');
    expect(s.request).toEqual({ use: 'round', count: 2 });
    s = provide(s);
    expect(s.phase).toBe('speedup-spin');
  });

  it('Round 4 thrown out unsolved by the host still ends in a Speed-Up', () => {
    let s = toRound(4);
    s = run(s, { type: 'END_ROUND_UNSOLVED' }, { type: 'CONTINUE' });
    expect(s.stage).toBe('speedup');
  });

  it('the Speed-Up that Round 4 opened is the last round: it is not followed by another', () => {
    let s = toRound(4);
    s = autoplay(s, (st) => st.stage === 'bonus' || st.stage === 'game-over');
    expect(s.stage).toBe('bonus');
  });

  it('a Speed-Up that is ended unsolved ends the game anyway', () => {
    let s = toRound(4);
    s = run(s, { type: 'RING_BELL' });
    s = provide(s);
    s = run(s, { type: 'END_ROUND_UNSOLVED' }, { type: 'CONTINUE' });
    expect(['bonus', 'tiebreak', 'game-over']).toContain(s.stage);
  });
});
