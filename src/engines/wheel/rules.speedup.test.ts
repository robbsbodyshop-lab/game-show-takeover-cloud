/** One test per sentence of "The Speed-Up" in docs/WHEEL_OF_FORTUNE_RULES.md (quoted in the test names). */
import { describe, expect, it } from 'vitest';
import { drawForIndex } from './wheels';
import { buildWheel } from './wheels';
import { run, team, toRound, provide, missLetter } from './testKit';
import type { WheelState } from './types';
import { wheelReduce } from './wheelEngine';
import { audienceView } from './selectors';

/** A Speed-Up in play on 'RED APPLE PIE': team 1 in control and about to spin. */
function speedUp(): WheelState {
  let s = toRound(4);
  s = run(s, { type: 'RING_BELL' });
  return s;
}
const cashIndex = (value: number): number =>
  buildWheel(4).findIndex((w) => w.kind === 'cash' && w.value === value && !w.top);

describe('The Speed-Up', () => {
  it('"The team in control spins once (non-cash results are re-spun)."', () => {
    let s = speedUp();
    const me = s.turn;
    const bankrupt = buildWheel(4).findIndex((w) => w.kind === 'bankrupt');
    const lose = buildWheel(4).findIndex((w) => w.kind === 'lose-turn');
    s = run(s, { type: 'SPEEDUP_SPIN', draw: drawForIndex(bankrupt) });
    expect(s.phase).toBe('speedup-spin');
    expect(s.turn).toBe(me);
    s = run(s, { type: 'SPEEDUP_SPIN', draw: drawForIndex(lose) });
    expect(s.phase).toBe('speedup-spin');
    expect(s.events.filter((e) => e.type === 'respin')).toHaveLength(2);
    s = run(s, { type: 'SPEEDUP_SPIN', draw: drawForIndex(cashIndex(700)) });
    expect(s.phase).toBe('speedup-act');
    expect(s.speedUp?.value).toBe(1700);
    // once: no second spin
    expect(wheelReduce(s, { type: 'SPEEDUP_SPIN', draw: 0.3 })).toBe(s);
    expect(wheelReduce(s, { type: 'SPIN', draw: 0.3 })).toBe(s);
  });

  it('the Speed-Up spin uses the $5,000 wheel with no specials', () => {
    let s = speedUp();
    s = run(s, { type: 'SPEEDUP_SPIN', draw: 0.001 });
    expect(s.speedUp?.value).toBe(6000);
  });

  it('"Every consonant for the rest of the round is worth that value plus $1,000; vowels are free and worth nothing."', () => {
    let s = speedUp();
    s = run(s, { type: 'SPEEDUP_SPIN', draw: drawForIndex(cashIndex(700)) });
    const me = s.turn ?? 0;
    s = run(s, { type: 'CALL_LETTER', letter: 'P' });
    expect(team(s, me).roundCash).toBe(3 * 1700);
    const s2 = run(speedUpSpun(), { type: 'CALL_LETTER', letter: 'E' });
    expect(team(s2, s2.teams[0]?.id ?? 0).roundCash).toBe(0);
    expect(s2.phase).toBe('speedup-window');
  });

  it('vowels cannot be bought: they are called for free', () => {
    const s = speedUpSpun();
    expect(wheelReduce(s, { type: 'BUY_VOWEL', letter: 'E' })).toBe(s);
  });

  it('"Teams take one action each in turn: call one letter or solve."', () => {
    const s = speedUpSpun();
    const me = s.turn;
    const called = run(s, { type: 'CALL_LETTER', letter: 'P' });
    // one action: no second letter in the same turn
    expect(called.turn).toBe(me);
    expect(wheelReduce(called, { type: 'CALL_LETTER', letter: 'D' })).toBe(called);
    expect(wheelReduce(called, { type: 'SPEEDUP_SPIN', draw: 0.2 })).toBe(called);
    const solving = run(s, { type: 'SOLVE_START' });
    expect(solving.phase).toBe('solving');
  });

  it('"After a correct letter the team has 3 seconds to solve." (a window flag for the UI clock)', () => {
    let s = speedUpSpun();
    expect(audienceView(s).speedUp?.window).toBe(false);
    s = run(s, { type: 'CALL_LETTER', letter: 'P' });
    expect(s.phase).toBe('speedup-window');
    expect(audienceView(s).speedUp).toEqual({ value: 1700, window: true });
    const solving = run(s, { type: 'SOLVE_START' });
    expect(run(solving, { type: 'SOLVE', verdict: 'correct' }).phase).toBe('round-award');
  });

  it('"A miss ... passes play."', () => {
    const s = speedUpSpun();
    const me = s.turn;
    const next = run(s, { type: 'CALL_LETTER', letter: missLetter(s) });
    expect(next.turn).not.toBe(me);
    expect(next.phase).toBe('speedup-act');
  });

  it('"... a repeat ... passes play."', () => {
    let s = speedUpSpun();
    s = run(s, { type: 'CALL_LETTER', letter: 'P' }, { type: 'TIME_OUT', team: s.turn ?? 0 });
    const me = s.turn;
    const next = run(s, { type: 'CALL_LETTER', letter: 'P' });
    expect(next.turn).not.toBe(me);
  });

  it('"... a wrong solve ... passes play."', () => {
    const s = speedUpSpun();
    const me = s.turn;
    const next = run(s, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'wrong' });
    expect(next.turn).not.toBe(me);
    expect(next.phase).toBe('speedup-act');
  });

  it('"... or running out of time passes play."', () => {
    let s = speedUpSpun();
    const me = s.turn ?? 0;
    s = run(s, { type: 'CALL_LETTER', letter: 'P' }, { type: 'TIME_OUT', team: me });
    expect(s.turn).not.toBe(me);
    expect(s.phase).toBe('speedup-act');
    // a late solve gives the solve back to the team that ran out of time (until the next team acts)
    const late = run(s, { type: 'LATE_SOLVE' });
    expect(late.turn).toBe(me);
    expect(late.phase).toBe('solving');
  });

  it('"The solver banks the round (house minimum applies) and the game ends."', () => {
    let s = speedUpSpun();
    const me = s.turn ?? 0;
    const bank = team(s, me).bank;
    s = run(
      s,
      { type: 'CALL_LETTER', letter: 'P' },
      { type: 'SOLVE_START' },
      { type: 'SOLVE', verdict: 'correct' },
    );
    expect(team(s, me).bank - bank).toBe(5100);
    expect(s.award).toMatchObject({ speedUp: true, amount: 5100 });
    expect(s.teams.every((t) => t.roundCash === 0)).toBe(true);
    s = run(s, { type: 'CONTINUE' });
    expect(s.plan[s.planIndex]?.kind).toBe('bonus');
    expect(s.stage).toBe('bonus');
    // the house minimum
    const quick = run(speedUpSpun(), { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'correct' });
    expect(quick.award?.amount).toBe(1000);
  });

  it('money already earned in the round counts when the bell turns it into the Speed-Up', () => {
    let s = toRound(2);
    const me = s.turn ?? 0;
    s = run(s, { type: 'SPIN', draw: drawForIndex(1) }, { type: 'CALL_LETTER', letter: 'P' });
    const cash = team(s, me).roundCash;
    s = run(s, { type: 'RING_BELL' });
    expect(s.stage).toBe('speedup');
    expect(team(s, me).roundCash).toBe(cash);
    expect(s.puzzle?.called).toEqual(['P']);
    expect(s.turn).toBe(me);
  });

  it('the Speed-Up has no skip of the puzzle: a thrown-out puzzle keeps the spin value', () => {
    let s = speedUpSpun();
    s = run(s, { type: 'THROW_OUT_PUZZLE' });
    expect(s.phase).toBe('speedup-act');
    expect(s.speedUp?.value).toBe(1700);
  });

  it('a Speed-Up round that nobody can finish is thrown out when every letter is gone and everyone failed', () => {
    let s = speedUpSpun();
    for (const l of ['P', 'D', 'R', 'L', 'E', 'A', 'I']) {
      s = { ...s, puzzle: s.puzzle && { ...s.puzzle, called: [...s.puzzle.called, l] } };
    }
    s = { ...s, turnDry: true };
    for (let i = 0; i < 3; i++) s = run(s, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'wrong' });
    expect(s.puzzle?.puzzle.phrase).toBe('SPARE PUZZLE');
  });

  it('provide works for the Speed-Up that Round 4 opened', () => {
    let s = toRound(4);
    s = run(s, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'correct' }, { type: 'CONTINUE' });
    s = provide(s);
    expect(s.stage).toBe('speedup');
    expect(s.turn).toBe(2); // the team after the Round 4 starter
  });
});

function speedUpSpun(): WheelState {
  return run(speedUp(), { type: 'SPEEDUP_SPIN', draw: drawForIndex(cashIndex(700)) });
}
