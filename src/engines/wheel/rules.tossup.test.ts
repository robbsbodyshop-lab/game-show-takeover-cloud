/** One test per bullet of "Toss-ups" in docs/WHEEL_OF_FORTUNE_RULES.md (quoted in the test names). */
import { describe, expect, it } from 'vitest';
import { advanceTo, newGame, provide, run, solveTossup, team, toRound } from './testKit';
import type { WheelState } from './types';
import { wheelReduce } from './wheelEngine';
import { audienceView, phoneControls } from './selectors';

const reveal = (s: WheelState, draw = 0): WheelState => wheelReduce(s, { type: 'TOSSUP_REVEAL_NEXT', draw });
const shown = (s: WheelState): number => s.puzzle?.shown.filter(Boolean).length ?? 0;

describe('Toss-ups', () => {
  it('"Letters appear one at a time at random."', () => {
    let s = newGame();
    expect(shown(s)).toBe(0);
    const total = s.puzzle?.tiles.length ?? 0;
    s = reveal(s, 0.5);
    expect(shown(s)).toBe(1);
    const idx = s.puzzle?.shown.findIndex(Boolean) ?? -1;
    expect(idx).toBe(Math.floor(0.5 * total));
    // the draw picks among the tiles still hidden
    s = reveal(s, 0);
    expect(shown(s)).toBe(2);
    expect(s.puzzle?.shown[0]).toBe(true);
    // deterministic for the same draws
    const fresh = newGame();
    expect(reveal(fresh, 0.5)).toEqual(reveal(fresh, 0.5));
  });

  it('"Once the first letter shows, any team may buzz in ... (a buzz before it does nothing)."', () => {
    const s0 = newGame();
    expect(wheelReduce(s0, { type: 'BUZZ', team: 2, at: 5 })).toBe(s0);
    const s = reveal(s0);
    const buzzed = wheelReduce(s, { type: 'BUZZ', team: 2, at: 5 });
    expect(buzzed.phase).toBe('tossup-answer');
    expect(buzzed.tossup?.buzzed).toBe(2);
    // a second buzz while someone answers does nothing
    expect(wheelReduce(buzzed, { type: 'BUZZ', team: 3, at: 6 })).toBe(buzzed);
    // reveal pauses while a team answers
    expect(reveal(buzzed)).toBe(buzzed);
    expect(wheelReduce(s, { type: 'BUZZ', team: 99, at: 5 })).toBe(s);
  });

  it('"A correct answer banks the toss-up value immediately (Bankrupt can never take it, and it cannot buy vowels)."', () => {
    let s = solveTossup(newGame(), 2);
    expect(s.phase).toBe('tossup-done');
    expect(team(s, 2).bank).toBe(1000);
    expect(team(s, 2).roundCash).toBe(0);
    expect(s.puzzle?.shown.every(Boolean)).toBe(true);
    s = advanceTo(
      s,
      (st) => st.stage === 'tossup' && st.phase === 'tossup-reveal' && st.tossup?.value === 2000,
    );
    s = solveTossup(s, 2);
    expect(team(s, 2).bank).toBe(3000);
  });

  it('"A wrong answer locks that team out of that puzzle only; the reveal continues."', () => {
    let s = reveal(newGame());
    s = run(s, { type: 'BUZZ', team: 1, at: 1 }, { type: 'TOSSUP_ANSWER', team: 1, verdict: 'wrong' });
    expect(s.phase).toBe('tossup-reveal');
    expect(team(s, 1).lockedOut).toBe(true);
    expect(wheelReduce(s, { type: 'BUZZ', team: 1, at: 2 })).toBe(s);
    const before = shown(s);
    s = reveal(s);
    expect(shown(s)).toBe(before + 1);
    expect(wheelReduce(s, { type: 'BUZZ', team: 2, at: 3 }).phase).toBe('tossup-answer');
    // the lockout is for this puzzle only
    s = run(s, { type: 'BUZZ', team: 2, at: 3 }, { type: 'TOSSUP_ANSWER', team: 2, verdict: 'correct' });
    s = advanceTo(s, (st) => st.phase === 'tossup-reveal' && st.tossup?.value === 2000);
    expect(s.teams.every((t) => !t.lockedOut)).toBe(true);
  });

  it('only the team that buzzed can be ruled on', () => {
    let s = reveal(newGame());
    s = run(s, { type: 'BUZZ', team: 1, at: 1 });
    expect(wheelReduce(s, { type: 'TOSSUP_ANSWER', team: 2, verdict: 'correct' })).toBe(s);
  });

  it('"If the puzzle fills in, nobody wins it."', () => {
    let s = newGame();
    const n = s.puzzle?.tiles.length ?? 0;
    for (let i = 0; i < n; i++) s = reveal(s);
    expect(s.phase).toBe('tossup-done');
    expect(s.tossup?.solver).toBeNull();
    expect(s.teams.every((t) => t.bank === 0)).toBe(true);
    expect(s.events.some((e) => e.type === 'tossup-filled')).toBe(true);
  });

  it('a wrong answer when the last letter has already shown ends the toss-up with no winner', () => {
    let s = newGame();
    const n = s.puzzle?.tiles.length ?? 0;
    for (let i = 0; i < n - 1; i++) s = reveal(s);
    s = run(s, { type: 'BUZZ', team: 1, at: 1 });
    s = run(s, { type: 'TOSSUP_REVEAL_NEXT', draw: 0 }); // paused: ignored
    expect(s.phase).toBe('tossup-answer');
    s = reveal(run(s, { type: 'TOSSUP_ANSWER', team: 1, verdict: 'wrong' }));
    expect(s.phase).toBe('tossup-done');
  });

  it('"If a toss-up that decides a starter goes unsolved, the first team in play order starts (show: the player nearest the host)."', () => {
    const teams = [
      { id: 3, name: 'C' },
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
    ];
    let s = provide(wheelReduceCreate(teams));
    s = solveTossup(s, 1);
    s = advanceTo(s, (st) => st.phase === 'tossup-reveal' && st.tossup?.value === 2000);
    const n = s.puzzle?.tiles.length ?? 0;
    for (let i = 0; i < n; i++) s = reveal(s);
    expect(s.phase).toBe('tossup-done');
    s = advanceTo(s, (st) => st.stage === 'round' && st.phase === 'choose');
    expect(s.turn).toBe(3);
  });

  it('the toss-up family does not use the spin: the controls on a phone offer BUZZ to the teams that may', () => {
    let s = newGame();
    expect(phoneControls(s)).toMatchObject({
      activeTeam: null,
      buzzTeams: [],
      offLabel: 'WAIT FOR A LETTER',
    });
    s = reveal(s);
    expect(phoneControls(s).buzzTeams).toEqual([1, 2, 3]);
    s = run(s, { type: 'BUZZ', team: 1, at: 1 }, { type: 'TOSSUP_ANSWER', team: 1, verdict: 'wrong' });
    expect(phoneControls(s).buzzTeams).toEqual([2, 3]);
    expect(audienceView(s).teams.find((t) => t.id === 1)?.lockedOut).toBe(true);
  });

  it('a toss-up can be ended unsolved by the host', () => {
    const s = run(reveal(newGame()), { type: 'END_ROUND_UNSOLVED' });
    expect(s.phase).toBe('tossup-done');
    expect(s.tossup?.solver).toBeNull();
    expect(s.puzzle?.shown.every(Boolean)).toBe(true);
  });

  it('a thrown-out toss-up gets the spare puzzle, unlocked', () => {
    let s = reveal(newGame());
    const first = s.puzzle?.puzzle.id;
    s = run(
      s,
      { type: 'BUZZ', team: 1, at: 1 },
      { type: 'TOSSUP_ANSWER', team: 1, verdict: 'wrong' },
      { type: 'THROW_OUT_PUZZLE' },
    );
    expect(s.puzzle?.puzzle.id).not.toBe(first);
    expect(s.puzzle?.shown.some(Boolean)).toBe(false);
    expect(team(s, 1).lockedOut).toBe(false);
    expect(s.phase).toBe('tossup-reveal');
  });

  it('the host reversing a right toss-up ruling takes the money back and throws the puzzle out', () => {
    let s = reveal(newGame());
    s = run(s, { type: 'BUZZ', team: 2, at: 1 }, { type: 'TOSSUP_ANSWER', team: 2, verdict: 'correct' });
    expect(team(s, 2).bank).toBe(1000);
    const first = s.puzzle?.puzzle.id;
    s = run(s, { type: 'HOST_SOLVE_OVERRIDE', verdict: 'wrong' });
    expect(team(s, 2).bank).toBe(0);
    expect(s.phase).toBe('tossup-reveal');
    expect(s.puzzle?.puzzle.id).not.toBe(first);
  });

  it('the host reversing a wrong toss-up ruling gives the points to that team', () => {
    let s = reveal(newGame());
    s = run(s, { type: 'BUZZ', team: 2, at: 1 }, { type: 'TOSSUP_ANSWER', team: 2, verdict: 'wrong' });
    s = run(s, { type: 'HOST_SOLVE_OVERRIDE', verdict: 'correct' });
    expect(team(s, 2).bank).toBe(1000);
    expect(team(s, 2).lockedOut).toBe(false);
    expect(s.phase).toBe('tossup-done');
  });
});

import { createWheelState } from './wheelEngine';
function wheelReduceCreate(teams: { id: number; name: string }[]): WheelState {
  return createWheelState({ teams });
}

describe('Fortune Frenzy', () => {
  const frenzy = () => newGame({ opening: 'frenzy' });

  it('"30 seconds of back-to-back $1,000 toss-up puzzles in one category" (ten requested: six plus four spares)', () => {
    const s0 = createWheelState({
      teams: [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ],
      settings: { opening: 'frenzy' },
    });
    expect(s0.request).toEqual({ use: 'tossup', count: 10 });
    expect(s0.frenzy?.durationMs).toBe(30000);
    expect(s0.tossup?.value).toBe(1000);
  });

  it('the clock starts with the first letter and runs down', () => {
    let s = frenzy();
    s = wheelReduce(s, { type: 'FRENZY_TICK', ms: 5000 });
    expect(s.frenzy?.msLeft).toBe(30000); // not started yet
    s = reveal(s);
    expect(s.frenzy?.started).toBe(true);
    s = wheelReduce(s, { type: 'FRENZY_TICK', ms: 5000 });
    expect(s.frenzy?.msLeft).toBe(25000);
  });

  it('a correct answer banks $1,000 and the next puzzle starts at once', () => {
    let s = reveal(frenzy());
    const first = s.puzzle?.puzzle.id;
    s = run(s, { type: 'BUZZ', team: 2, at: 1 }, { type: 'TOSSUP_ANSWER', team: 2, verdict: 'correct' });
    expect(team(s, 2).bank).toBe(1000);
    expect(s.puzzle?.puzzle.id).not.toBe(first);
    expect(s.phase).toBe('tossup-reveal');
    expect(s.frenzy?.solved).toBe(1);
    expect(s.queue.length).toBe(8);
  });

  it('"In Fortune Frenzy a wrong answer throws the puzzle out and the next one starts"', () => {
    let s = reveal(frenzy());
    const first = s.puzzle?.puzzle.id;
    s = run(s, { type: 'BUZZ', team: 2, at: 1 }, { type: 'TOSSUP_ANSWER', team: 2, verdict: 'wrong' });
    expect(s.puzzle?.puzzle.id).not.toBe(first);
    expect(s.phase).toBe('tossup-reveal');
    expect(team(s, 2).lockedOut).toBe(false);
    expect(team(s, 2).bank).toBe(0);
  });

  it('"... and the 30-second clock keeps running while a team answers."', () => {
    let s = reveal(frenzy());
    s = run(s, { type: 'BUZZ', team: 2, at: 1 }, { type: 'FRENZY_TICK', ms: 10000 });
    expect(s.frenzy?.msLeft).toBe(20000);
    expect(s.phase).toBe('tossup-answer');
  });

  it('when the clock runs out the frenzy ends and the last solver starts Round 1', () => {
    let s = reveal(frenzy());
    s = run(s, { type: 'BUZZ', team: 3, at: 1 }, { type: 'TOSSUP_ANSWER', team: 3, verdict: 'correct' });
    s = reveal(s);
    s = run(s, { type: 'BUZZ', team: 1, at: 1 }, { type: 'TOSSUP_ANSWER', team: 1, verdict: 'correct' });
    s = reveal(s);
    s = run(s, { type: 'FRENZY_TICK', ms: 30000 });
    expect(s.phase).toBe('tossup-done');
    expect(s.frenzy?.msLeft).toBe(0);
    s = advanceTo(s, (st) => st.stage === 'round' && st.phase === 'choose');
    expect(s.turn).toBe(1);
    expect(team(s, 1).bank).toBe(1000);
    expect(team(s, 3).bank).toBe(1000);
  });

  it('an answer in flight when the clock expires still counts', () => {
    let s = reveal(frenzy());
    s = run(s, { type: 'BUZZ', team: 2, at: 1 }, { type: 'FRENZY_TICK', ms: 31000 });
    expect(s.phase).toBe('tossup-answer');
    expect(s.frenzy?.expired).toBe(true);
    s = run(s, { type: 'TOSSUP_ANSWER', team: 2, verdict: 'correct' });
    expect(team(s, 2).bank).toBe(1000);
    expect(s.phase).toBe('tossup-done');
    expect(s.tossup?.solver).toBe(2);
  });

  it('with nobody solving, the first team in play order starts Round 1', () => {
    let s = reveal(frenzy());
    s = run(s, { type: 'FRENZY_TICK', ms: 30000 });
    s = advanceTo(s, (st) => st.stage === 'round' && st.phase === 'choose');
    expect(s.turn).toBe(1);
  });

  it('when the six puzzles run out the engine asks for more from the same category', () => {
    let s = frenzy();
    s = { ...s, queue: s.queue.slice(0, 1) };
    s = reveal(s);
    s = run(s, { type: 'BUZZ', team: 1, at: 1 }, { type: 'TOSSUP_ANSWER', team: 1, verdict: 'correct' });
    expect(s.phase).toBe('tossup-reveal');
    s = reveal(s);
    s = run(s, { type: 'BUZZ', team: 1, at: 1 }, { type: 'TOSSUP_ANSWER', team: 1, verdict: 'correct' });
    expect(s.phase).toBe('awaiting-puzzles');
    expect(s.request).toMatchObject({ use: 'tossup', count: 4, category: 'THING' });
    s = run(s, { type: 'FRENZY_TICK', ms: 1000 });
    expect(s.frenzy?.msLeft).toBe(29000);
    s = provide(s);
    expect(s.phase).toBe('tossup-reveal');
  });
});

describe('Triple Toss-Up', () => {
  const toTriple = () => {
    let s = toRound(3);
    s = run(s, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'correct' });
    return advanceTo(s, (st) => st.stage === 'triple' && st.phase === 'tossup-reveal');
  };
  const playOne = (s: WheelState, who: number | null): WheelState => {
    let st = s;
    if (who === null) {
      const n = st.puzzle?.tiles.length ?? 0;
      for (let i = 0; i < n; i++) st = reveal(st);
    } else {
      st = solveTossup(st, who);
    }
    return run(st, { type: 'CONTINUE' });
  };

  it('"three toss-ups in one category and theme, $2,000 each, plus $4,000 for sweeping all three"', () => {
    let s = toTriple();
    expect(s.request).toBeNull();
    const before = team(s, 2).bank;
    s = playOne(s, 2);
    expect(team(s, 2).bank - before).toBe(2000);
    s = playOne(s, 2);
    expect(s.triple?.index).toBe(2);
    s = solveTossup(s, 2);
    expect(team(s, 2).bank - before).toBe(2000 * 3 + 4000);
    expect(s.events.some((e) => e.type === 'sweep')).toBe(true);
  });

  it('no sweep when the three are split', () => {
    let s = toTriple();
    const before = team(s, 2).bank;
    s = playOne(s, 2);
    s = playOne(s, 1);
    s = solveTossup(s, 2);
    expect(team(s, 2).bank - before).toBe(4000);
    expect(s.events.some((e) => e.type === 'sweep')).toBe(false);
  });

  it('"The third solver starts Round 4."', () => {
    let s = toTriple();
    s = playOne(s, 2);
    s = playOne(s, 2);
    s = solveTossup(s, 3);
    s = advanceTo(s, (st) => st.stage === 'round' && st.round === 4 && st.phase === 'choose');
    expect(s.turn).toBe(3);
  });

  it('an unsolved third puzzle: the first team in play order starts Round 4', () => {
    let s = toTriple();
    s = playOne(s, 2);
    s = playOne(s, 2);
    const n = s.puzzle?.tiles.length ?? 0;
    for (let i = 0; i < n; i++) s = reveal(s);
    s = advanceTo(s, (st) => st.stage === 'round' && st.round === 4 && st.phase === 'choose');
    expect(s.turn).toBe(1);
  });

  it('the Triple Toss-Up asks for three puzzles of one set', () => {
    let s = toRound(3);
    s = run(s, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'correct' }, { type: 'CONTINUE' });
    expect(s.stage).toBe('triple');
    expect(s.request).toEqual({ use: 'triple', count: 3 });
  });
});
