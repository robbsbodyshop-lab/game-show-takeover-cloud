/** One test per bullet of "A turn" in docs/WHEEL_OF_FORTUNE_RULES.md (quoted in the test names). */
import { describe, expect, it } from 'vitest';
import { consonantsRemaining, vowelsRemaining } from './puzzleState';
import { isCash, missLetter, run, spinOn, team, toRound, makePuzzle, provide } from './testKit';
import { drawForIndex } from './wheels';
import { wheelReduce } from './wheelEngine';

const spin700 = (s: ReturnType<typeof toRound>) => spinOn(s, isCash(700));

describe('A turn', () => {
  it('"Spin, then call a consonant (Y is a consonant). Every occurrence is revealed and pays the wedge value times the count into the round bank."', () => {
    const s0 = toRound(1);
    const s = run(s0, spin700(s0), { type: 'CALL_LETTER', letter: 'p' });
    expect(s.puzzle?.called).toEqual(['P']);
    expect(s.puzzle?.queue).toHaveLength(3);
    expect(team(s, 1).roundCash).toBe(2100);
    expect(s.turn).toBe(1);
    expect(s.phase).toBe('choose');
  });

  it('a consonant can only be called after a spin', () => {
    const s = toRound(1);
    expect(wheelReduce(s, { type: 'CALL_LETTER', letter: 'P' })).toBe(s);
  });

  it('Y is a consonant: it is called after a spin and cannot be bought', () => {
    const s0 = toRound(1, {}, 1, 'YELLOW HAT');
    const bought = wheelReduce(
      { ...s0, teams: s0.teams.map((t) => ({ ...t, roundCash: 1000 })) },
      { type: 'BUY_VOWEL', letter: 'Y' },
    );
    expect(bought).toEqual({ ...s0, teams: s0.teams.map((t) => ({ ...t, roundCash: 1000 })) });
    const s = run(s0, spin700(s0), { type: 'CALL_LETTER', letter: 'Y' });
    expect(team(s, 1).roundCash).toBe(700);
  });

  it('"Buy a vowel for a flat $250 from this round\'s spendable cash (at the start of a turn or after a correct letter). Vowels earn nothing."', () => {
    const s0 = toRound(1);
    const poor = wheelReduce(s0, { type: 'BUY_VOWEL', letter: 'E' });
    expect(poor).toBe(s0);
    let s = run(s0, spin700(s0), { type: 'CALL_LETTER', letter: 'P' });
    s = run(s, { type: 'BUY_VOWEL', letter: 'e' });
    expect(team(s, 1).roundCash).toBe(2100 - 250);
    expect(s.puzzle?.called).toEqual(['P', 'E']);
    expect(s.turn).toBe(1);
    // another vowel straight away: "after a correct letter" includes after a correct vowel
    s = run(s, { type: 'BUY_VOWEL', letter: 'A' });
    expect(team(s, 1).roundCash).toBe(2100 - 500);
  });

  it('prize money cannot buy a vowel (only spendable round cash can)', () => {
    const s0 = toRound(1);
    const rich = {
      ...s0,
      teams: s0.teams.map((t) => (t.id === 1 ? { ...t, roundPrizes: [{ name: 'X', value: 9000 }] } : t)),
    };
    expect(wheelReduce(rich, { type: 'BUY_VOWEL', letter: 'E' })).toBe(rich);
  });

  it('"Solve at the start of a turn or after a correct letter."', () => {
    const s0 = toRound(1);
    expect(wheelReduce(s0, { type: 'SOLVE_START' }).phase).toBe('solving');
    const s1 = run(s0, spin700(s0), { type: 'CALL_LETTER', letter: 'P' });
    expect(wheelReduce(s1, { type: 'SOLVE_START' }).phase).toBe('solving');
  });

  it('"A team that spins and solves without calling a letter is accepted if right but earns nothing for that spin."', () => {
    const s0 = toRound(1);
    const spun = run(s0, spin700(s0));
    expect(spun.phase).toBe('call-consonant');
    const solved = run(spun, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'correct' });
    expect(solved.phase).toBe('round-award');
    expect(team(solved, 1).bank - team(s0, 1).bank).toBe(1000); // house minimum, nothing from the spin
  });

  it('"The turn passes on: a consonant not in the puzzle"', () => {
    const s0 = toRound(1);
    const s = run(s0, spin700(s0), { type: 'CALL_LETTER', letter: missLetter(s0) });
    expect(s.turn).toBe(2);
    expect(s.phase).toBe('choose');
    expect(team(s, 1).roundCash).toBe(0);
  });

  it('"... any letter already called"', () => {
    const s0 = toRound(1);
    let s = run(s0, spin700(s0), { type: 'CALL_LETTER', letter: 'P' });
    s = run(s, spin700(s), { type: 'CALL_LETTER', letter: 'P' });
    expect(s.turn).toBe(2);
    expect(team(s, 1).roundCash).toBe(2100); // nothing paid for the repeat
  });

  it('"... a vowel not in the puzzle (the $250 is still spent)"', () => {
    const s0 = toRound(1, {}, 1, 'BLT SUB');
    let s = run(s0, spin700(s0), { type: 'CALL_LETTER', letter: 'B' });
    expect(team(s, 1).roundCash).toBe(1400);
    s = run(s, { type: 'BUY_VOWEL', letter: 'A' });
    expect(team(s, 1).roundCash).toBe(1150);
    expect(s.turn).toBe(2);
  });

  it('"... a wrong solve"', () => {
    const s0 = toRound(1);
    const s = run(s0, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'wrong' });
    expect(s.turn).toBe(2);
    expect(s.phase).toBe('choose');
  });

  it('"... Lose a Turn, Bankrupt"', () => {
    const s0 = toRound(1);
    const lose = run(
      s0,
      spinOn(s0, (w) => w.kind === 'lose-turn'),
    );
    expect(lose.turn).toBe(2);
    const bust = run(
      s0,
      spinOn(s0, (w) => w.kind === 'bankrupt'),
    );
    expect(bust.turn).toBe(2);
  });

  it('"... or running out of time (timer is a host setting: off, 5 or 10 seconds; the host can change it mid-game)"', () => {
    const s0 = toRound(1);
    expect(s0.settings.turnTimerSec).toBe(0);
    let s = run(s0, { type: 'SET_TURN_TIMER', sec: 5 });
    expect(s.settings.turnTimerSec).toBe(5);
    s = run(s, spin700(s0), { type: 'SET_TURN_TIMER', sec: 10 });
    expect(s.settings.turnTimerSec).toBe(10);
    expect(wheelReduce(s, { type: 'SET_TURN_TIMER', sec: 10 })).toBe(s);
    const out = run(s0, { type: 'TIME_OUT', team: 1 });
    expect(out.turn).toBe(2);
    // only the team in control can time out
    expect(wheelReduce(s0, { type: 'TIME_OUT', team: 2 })).toBe(s0);
  });

  it('SET_TURN_TIMER is not an undo step', () => {
    const s0 = toRound(1);
    const s = run(s0, { type: 'SET_TURN_TIMER', sec: 5 });
    expect(s.history).toHaveLength(s0.history.length);
    const back = run(s, spin700(s0), { type: 'UNDO' });
    expect(back.settings.turnTimerSec).toBe(5);
  });

  it('"A team whose answer began before its clock ran out may be given its solve back, until the team that got the turn acts (app choice)."', () => {
    const s0 = toRound(1);
    const timed = run(s0, { type: 'TIME_OUT', team: 1 });
    expect(timed.timedOut).toBe(1);
    const late = run(timed, { type: 'LATE_SOLVE' });
    expect(late.turn).toBe(1);
    expect(late.phase).toBe('solving');
    expect(run(late, { type: 'SOLVE', verdict: 'correct' }).phase).toBe('round-award');
    // the team that got the turn acts: too late
    const acted = run(timed, spin700(timed));
    expect(acted.timedOut).toBeNull();
    expect(wheelReduce(acted, { type: 'LATE_SOLVE' })).toBe(acted);
  });

  it('a late solve that is cancelled hands the turn on again', () => {
    const s0 = toRound(1);
    const late = run(s0, { type: 'TIME_OUT', team: 1 }, { type: 'LATE_SOLVE' }, { type: 'SOLVE_CANCEL' });
    expect(late.turn).toBe(1);
    expect(late.phase).toBe('choose');
    const out = run(late, { type: 'TIME_OUT', team: 1 });
    expect(out.turn).toBe(2);
  });

  it('"A vowel called right after a spin is ignored and the team is asked for a consonant."', () => {
    const s0 = toRound(1);
    const spun = run(s0, spin700(s0));
    expect(wheelReduce(spun, { type: 'CALL_LETTER', letter: 'E' })).toBe(spun);
    expect(wheelReduce(spun, { type: 'BUY_VOWEL', letter: 'E' })).toBe(spun);
    expect(wheelReduce(spun, { type: 'CALL_LETTER', letter: '7' })).toBe(spun);
    expect(run(spun, { type: 'CALL_LETTER', letter: 'P' }).phase).toBe('choose');
  });

  it('"When every vowel is revealed, vowels can no longer be bought."', () => {
    const s0 = toRound(1, {}, 1, 'AAA B');
    let s = { ...s0, teams: s0.teams.map((t) => ({ ...t, roundCash: 5000 })) };
    s = run(s, { type: 'BUY_VOWEL', letter: 'A' });
    expect(vowelsRemaining(s.puzzle!)).toBe(0);
    expect(wheelReduce(s, { type: 'BUY_VOWEL', letter: 'E' })).toBe(s);
    expect(team(s, 1).roundCash).toBe(4750);
  });

  it('"When every consonant is revealed, nobody may spin: teams buy vowels or solve."', () => {
    const s0 = toRound(1, {}, 1, 'AB');
    let s = { ...s0, teams: s0.teams.map((t) => ({ ...t, roundCash: 5000 })) };
    s = run(s, spin700(s), { type: 'CALL_LETTER', letter: 'B' });
    expect(consonantsRemaining(s.puzzle!)).toBe(0);
    expect(s.phase).toBe('choose');
    expect(wheelReduce(s, spin700(s))).toBe(s);
    expect(wheelReduce(s, { type: 'SOLVE_START' }).phase).toBe('solving');
    expect(wheelReduce(s, { type: 'BUY_VOWEL', letter: 'A' }).phase).toBe('choose');
  });

  it('"If every team then fails in turn and nobody can buy a vowel, the puzzle is thrown out unsolved (app choice)."', () => {
    const s0 = toRound(1, {}, 1, 'AB');
    let s = run(s0, spin700(s0), { type: 'CALL_LETTER', letter: 'B' });
    // team 1 has $1,400 and could still buy the A: nobody is stuck
    s = run(s, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'wrong' });
    expect(s.turn).toBe(2);
    s = run(s, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'wrong' });
    s = run(s, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'wrong' });
    // all three failed, but team 1 can still buy a vowel: the puzzle stays
    expect(s.puzzle?.puzzle.phrase).toBe('AB');
    // everyone is broke and cannot buy: the next full rotation of failures throws it out
    s = { ...s, teams: s.teams.map((t) => ({ ...t, roundCash: 0 })), dryFails: 0 };
    s = run(s, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'wrong' });
    s = run(s, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'wrong' });
    expect(s.puzzle?.puzzle.phrase).toBe('AB');
    s = run(s, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'wrong' });
    expect(s.puzzle?.puzzle.phrase).toBe('SPARE PUZZLE');
    expect(s.events.some((e) => e.type === 'puzzle-thrown-out')).toBe(true);
    expect(s.phase).toBe('choose');
  });

  it('"... a turn lost to a Mystery flip\'s Bankrupt does not count toward that, so the flipping team still gets its try."', () => {
    const s0 = toRound(2, {}, 1, 'AB');
    expect(s0.turn).toBe(2); // Round 2 starts with the team after the Round 1 starter
    let s = { ...s0, teams: s0.teams.map((t) => ({ ...t, roundCash: 0 })) };
    s = run(
      s,
      spinOn(s, (w) => w.kind === 'mystery'),
      { type: 'CALL_LETTER', letter: 'B' },
    );
    expect(s.phase).toBe('mystery-choice');
    // the last consonant is gone; the flip lands on Bankrupt and the turn passes
    s = run(s, { type: 'MYSTERY', choice: 'flip', draw: 0.9 });
    expect(s.turn).toBe(3);
    expect(s.dryFails).toBe(0);
    // teams 3 and 1 fail; team 2 (the flipper) has not had its try yet, so the puzzle stays
    s = run(s, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'wrong' });
    s = run(s, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'wrong' });
    expect(s.turn).toBe(2);
    expect(s.puzzle?.puzzle.phrase).toBe('AB');
    s = run(s, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'wrong' });
    expect(s.puzzle?.puzzle.phrase).toBe('SPARE PUZZLE');
  });

  it('"A fully revealed puzzle must still be solved aloud by the team in control."', () => {
    const s0 = toRound(1, {}, 1, 'AB');
    let s = { ...s0, teams: s0.teams.map((t) => ({ ...t, roundCash: 5000 })) };
    s = run(s, spin700(s), { type: 'CALL_LETTER', letter: 'B' }, { type: 'BUY_VOWEL', letter: 'A' });
    expect(s.puzzle?.queue).toHaveLength(2);
    expect(s.phase).toBe('choose');
    expect(s.stage).toBe('round'); // not auto-solved
    expect(run(s, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'correct' }).phase).toBe('round-award');
  });

  it('the Same ruling twice counts once: a second SOLVE is illegal after the first', () => {
    const s0 = toRound(1);
    const s = run(s0, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'wrong' });
    expect(wheelReduce(s, { type: 'SOLVE', verdict: 'wrong' })).toBe(s);
  });

  it('a letter call within 500 ms of play passing is dropped (FR-044)', () => {
    const s0 = toRound(1);
    const passed = run(s0, { type: 'SKIP_TURN', at: 10_000 });
    expect(passed.turn).toBe(2);
    // team 2 spins, but a stray letter call from the previous click arrives right after the pass in the Speed-Up
    expect(passed.passedAt).toBe(10_000);
    const spun = run(passed, spinOn(passed, isCash(700)));
    expect(wheelReduce(spun, { type: 'CALL_LETTER', letter: 'P', at: 10_300 })).toBe(spun);
    expect(wheelReduce(spun, { type: 'CALL_LETTER', letter: 'P', at: 10_600 })).not.toBe(spun);
  });

  it('a thrown-out puzzle keeps the turn and the money', () => {
    const s0 = toRound(1);
    let s = run(s0, spin700(s0), { type: 'CALL_LETTER', letter: 'P' });
    s = run(s, { type: 'THROW_OUT_PUZZLE' });
    expect(s.turn).toBe(1);
    expect(team(s, 1).roundCash).toBe(2100);
    expect(s.puzzle?.puzzle.phrase).toBe('SPARE PUZZLE');
    expect(s.puzzle?.called).toEqual([]);
    expect(s.phase).toBe('choose');
  });

  it('with no queued puzzle a throw-out asks for a replacement and waits', () => {
    const s0 = toRound(1);
    let s = run(s0, { type: 'THROW_OUT_PUZZLE' });
    expect(s.queue).toHaveLength(0);
    s = run(s, { type: 'THROW_OUT_PUZZLE' });
    expect(s.phase).toBe('awaiting-puzzles');
    expect(s.request).toEqual({ use: 'round', count: 1 });
    const back = provide(s, [makePuzzle('NEW ONE')]);
    expect(back.phase).toBe('choose');
    expect(back.puzzle?.puzzle.phrase).toBe('NEW ONE');
    expect(back.turn).toBe(s.turn);
  });

  it('spinning draws the top-dollar wedge for the round ($2,500 in Round 1)', () => {
    const s0 = toRound(1);
    const s = run(s0, { type: 'SPIN', draw: drawForIndex(0) }, { type: 'CALL_LETTER', letter: 'D' });
    expect(team(s, 1).roundCash).toBe(2500);
  });
});
