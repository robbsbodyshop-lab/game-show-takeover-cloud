/** "The Bonus Round", the tiebreaker, the consolation and "How it maps to the event" in docs/WHEEL_OF_FORTUNE_RULES.md. */
import { describe, expect, it } from 'vitest';
import { autoplay, makePuzzle, newGame, provide, run, team } from './testKit';
import type { PuzzleInput, TeamId, WheelSettings, WheelState } from './types';
import { wheelReduce } from './wheelEngine';
import { audienceView, canAcceptLateBonus, gameResult, hostView, phoneControls } from './selectors';

const SHORT: Partial<WheelSettings> = { length: 'short' };

/** The Speed-Up has just been solved (award card showing) and the banks are set as given. */
function mainGameDone(banks: Record<TeamId, number>, settings: Partial<WheelSettings> = SHORT): WheelState {
  let s = autoplay(newGame(settings), (st) => st.phase === 'round-award' && st.award?.speedUp === true);
  for (const t of s.teams)
    s = run(s, { type: 'ADJUST_BANK', team: t.id, delta: (banks[t.id] ?? 0) - team(s, t.id).bank });
  return s;
}

const options = (): PuzzleInput[] => [
  makePuzzle('ONCE UPON A TIME', { category: 'PHRASE', use: ['bonus'], lines: ['ONCE UPON', 'A TIME'] }),
  makePuzzle('SANDY BEACH', { category: 'PLACE', use: ['bonus'] }),
  makePuzzle('WINTER GAMES', { category: 'THING', use: ['bonus'] }),
];

/** The Bonus Round just opened for the highest team. */
function atBonus(
  banks: Record<TeamId, number> = { 1: 9000, 2: 3000, 3: 1000 },
  patchTeam?: Partial<WheelState['teams'][number]>,
): WheelState {
  let s = mainGameDone(banks);
  s = run(s, { type: 'CONTINUE' });
  expect(s.stage).toBe('bonus');
  if (patchTeam) s = { ...s, teams: s.teams.map((t) => (t.id === 1 ? { ...t, ...patchTeam } : t)) };
  return provide(s, options());
}

describe('Tiebreaker and consolation', () => {
  it('"a tie is broken by a toss-up between the tied teams worth $1,000"', () => {
    let s = mainGameDone({ 1: 5000, 2: 5000, 3: 1000 });
    s = run(s, { type: 'CONTINUE' });
    expect(s.stage).toBe('tiebreak');
    expect(s.request).toEqual({ use: 'tiebreak', count: 2 });
    s = provide(s);
    expect(s.tossup).toMatchObject({ value: 1000, eligible: [1, 2] });
    s = run(s, { type: 'TOSSUP_REVEAL_NEXT', draw: 0 });
    // team 3 is not in the tie: it cannot buzz
    expect(wheelReduce(s, { type: 'BUZZ', team: 3, at: 1 })).toBe(s);
    s = run(s, { type: 'BUZZ', team: 2, at: 1 }, { type: 'TOSSUP_ANSWER', team: 2, verdict: 'correct' });
    expect(team(s, 2).bank).toBe(6000);
    s = provide(run(s, { type: 'CONTINUE' }), options());
    expect(s.stage).toBe('bonus');
    expect(s.bonus?.team).toBe(2);
  });

  it('a tiebreaker nobody solves is played again', () => {
    let s = provide(run(mainGameDone({ 1: 5000, 2: 5000, 3: 1000 }), { type: 'CONTINUE' }));
    const n = s.puzzle?.tiles.length ?? 0;
    for (let i = 0; i < n; i++) s = run(s, { type: 'TOSSUP_REVEAL_NEXT', draw: 0 });
    expect(s.phase).toBe('tossup-done');
    s = run(s, { type: 'CONTINUE' });
    expect(s.stage).toBe('tiebreak');
    expect(s.request).toEqual({ use: 'tiebreak', count: 2 });
  });

  it('a tie the host settles by hand is skipped', () => {
    let s = mainGameDone({ 1: 5000, 2: 5000, 3: 1000 });
    s = run(s, { type: 'ADJUST_BANK', team: 1, delta: 100 }, { type: 'CONTINUE' });
    expect(s.stage).toBe('bonus');
  });

  it('a three-way tie for first is played between all three', () => {
    const s = run(mainGameDone({ 1: 4000, 2: 4000, 3: 4000 }), { type: 'CONTINUE' });
    expect(provide(s).tossup?.eligible).toEqual([1, 2, 3]);
  });

  it('"A team that won nothing gets $1,000."', () => {
    let s = mainGameDone({ 1: 5000, 2: 3000, 3: 0 });
    s = run(s, { type: 'CONTINUE' });
    expect(team(s, 3).bank).toBe(1000);
    expect(s.events.some((e) => e.type === 'consolation' && e.team === 3)).toBe(true);
    expect(team(s, 1).bank).toBe(5000);
  });

  it('with everyone at nothing the consolation makes a tie, and the tiebreaker decides', () => {
    const s = run(mainGameDone({ 1: 0, 2: 0, 3: 0 }), { type: 'CONTINUE' });
    expect(s.stage).toBe('tiebreak');
    expect(s.teams.every((t) => t.bank === 1000)).toBe(true);
  });
});

describe('The Bonus Round', () => {
  it('"The team with the highest total (cash plus prize values) plays"', () => {
    const s = atBonus({ 1: 2000, 2: 9000, 3: 4000 });
    expect(s.bonus?.team).toBe(2);
    expect(phoneControls(s).activeTeam).toBe(2);
  });

  it('a host setting can leave the Bonus Round out: the game ends after the main game', () => {
    let s = mainGameDone({ 1: 1000, 2: 3000, 3: 2000 }, { ...SHORT, bonusRound: false });
    s = run(s, { type: 'CONTINUE' });
    expect(s.stage).toBe('game-over');
    expect(gameResult(s)).toMatchObject({ winnerId: 2, bonusChips: 0 });
  });

  it('"1. The team picks one of three categories."', () => {
    let s = atBonus();
    expect(s.phase).toBe('bonus-category');
    expect(audienceView(s).bonus?.categories).toEqual(['PHRASE', 'PLACE', 'THING']);
    expect(wheelReduce(s, { type: 'BONUS_PICK_CATEGORY', category: 'NOPE' })).toBe(s);
    expect(wheelReduce(s, { type: 'BONUS_SPIN', draw: 0.5 })).toBe(s);
    s = run(s, { type: 'BONUS_PICK_CATEGORY', category: 'PLACE' });
    expect(s.phase).toBe('bonus-spin');
    expect(s.puzzle?.puzzle.phrase).toBe('SANDY BEACH');
    expect(audienceView(s).category).toBe('PLACE');
  });

  it('"2. It spins the Bonus Wheel ... The host keeps the envelope sealed."', () => {
    let s = atBonus();
    s = run(s, { type: 'BONUS_PICK_CATEGORY', category: 'PHRASE' }, { type: 'BONUS_SPIN', draw: 0.5 });
    expect(hostView(s).envelope).toEqual({ kind: 'cash', value: 90000 });
    const json = JSON.stringify(audienceView(s));
    expect(json).not.toContain('90000');
    expect(audienceView(s).bonus?.prize).toBeNull();
    expect(wheelReduce(s, { type: 'BONUS_SPIN', draw: 0.1 })).toBe(s); // one spin
  });

  it('"... with the $100,000 envelope worth $1,000,000 if the team holds the Million Dollar Wedge"', () => {
    let s = atBonus({ 1: 9000, 2: 3000, 3: 1000 }, { millionWedge: 'kept' });
    s = run(
      s,
      { type: 'BONUS_PICK_CATEGORY', category: 'PHRASE' },
      { type: 'BONUS_SPIN', draw: (7 + 0.5) / 24 },
    );
    expect(hostView(s).envelope).toEqual({ kind: 'cash', value: 1000000 });
    let t = atBonus();
    t = run(
      t,
      { type: 'BONUS_PICK_CATEGORY', category: 'PHRASE' },
      { type: 'BONUS_SPIN', draw: (7 + 0.5) / 24 },
    );
    expect(hostView(t).envelope).toEqual({ kind: 'cash', value: 100000 });
  });

  it('"3. R, S, T, L, N and E are revealed."', () => {
    let s = atBonus();
    s = run(s, { type: 'BONUS_PICK_CATEGORY', category: 'PHRASE' }, { type: 'BONUS_SPIN', draw: 0.5 });
    expect(s.puzzle?.called).toEqual(['R', 'S', 'T', 'L', 'N', 'E']);
    // ONCE UPON A TIME: N, N, E, T, E lit in reading order
    const letters = s.puzzle?.queue.map((i) => s.puzzle?.tiles[i]?.char).join('');
    expect(letters).toBe('NEN' + 'TE');
  });

  it('"The team calls three more consonants and one vowel ... repeats and invalid calls are simply asked again."', () => {
    let s = atBonus();
    s = run(s, { type: 'BONUS_PICK_CATEGORY', category: 'PHRASE' }, { type: 'BONUS_SPIN', draw: 0.5 });
    for (const bad of ['R', 'E', '7', '', 'CP'])
      expect(wheelReduce(s, { type: 'BONUS_CALL_LETTER', letter: bad })).toBe(s);
    s = run(s, { type: 'BONUS_CALL_LETTER', letter: 'c' }, { type: 'BONUS_CALL_LETTER', letter: 'P' });
    expect(wheelReduce(s, { type: 'BONUS_CALL_LETTER', letter: 'C' })).toBe(s); // repeat
    s = run(s, { type: 'BONUS_CALL_LETTER', letter: 'Z' }); // a miss still counts: it is one of the three
    expect(s.phase).toBe('bonus-letters');
    expect(wheelReduce(s, { type: 'BONUS_CALL_LETTER', letter: 'M' })).toBe(s); // a fourth consonant: asked again
    s = run(s, { type: 'BONUS_CALL_LETTER', letter: 'A' });
    expect(s.phase).toBe('bonus-ready');
    expect(s.bonus?.picked).toEqual(['C', 'P', 'Z', 'A']);
    expect(wheelReduce(s, { type: 'BONUS_CALL_LETTER', letter: 'I' })).toBe(s);
  });

  it('"(four consonants with a Wild Card)"', () => {
    let s = atBonus({ 1: 9000, 2: 3000, 3: 1000 }, { wildCard: true });
    s = run(s, { type: 'BONUS_PICK_CATEGORY', category: 'PHRASE' }, { type: 'BONUS_SPIN', draw: 0.5 });
    s = run(
      s,
      ...(['C', 'P', 'M', 'A'] as const).map((letter) => ({ type: 'BONUS_CALL_LETTER' as const, letter })),
    );
    expect(s.phase).toBe('bonus-letters');
    s = run(s, { type: 'BONUS_CALL_LETTER', letter: 'Q' });
    expect(s.phase).toBe('bonus-ready');
  });

  function ready(): WheelState {
    let s = atBonus();
    s = run(s, { type: 'BONUS_PICK_CATEGORY', category: 'PHRASE' }, { type: 'BONUS_SPIN', draw: 0.5 });
    return run(
      s,
      ...(['C', 'P', 'M', 'A'] as const).map((letter) => ({ type: 'BONUS_CALL_LETTER' as const, letter })),
    );
  }

  it('"4. Ten seconds to solve, any number of guesses."', () => {
    let s = ready();
    s = run(s, { type: 'CONTINUE' });
    expect(s.phase).toBe('bonus-solving');
    s = run(s, { type: 'BONUS_SOLVE', verdict: 'wrong' }, { type: 'BONUS_SOLVE', verdict: 'wrong' });
    expect(s.phase).toBe('bonus-solving');
    s = run(s, { type: 'BONUS_SOLVE', verdict: 'correct' });
    expect(s.phase).toBe('bonus-won');
    expect(s.puzzle?.shown.every(Boolean)).toBe(true);
  });

  it('"A correct answer before the clock starts also wins."', () => {
    const s = run(ready(), { type: 'BONUS_SOLVE', verdict: 'correct' });
    expect(s.phase).toBe('bonus-won');
  });

  it('when time is up the answer shows and the host can accept an answer that started before the buzzer', () => {
    let s = run(ready(), { type: 'CONTINUE' }, { type: 'BONUS_TIME_UP' });
    expect(s.phase).toBe('bonus-timeup');
    expect(s.bonus?.won).toBe(false);
    expect(canAcceptLateBonus(s)).toBe(true);
    expect(wheelReduce(s, { type: 'BONUS_SOLVE', verdict: 'correct' })).toBe(s);
    s = run(s, { type: 'BONUS_ACCEPT_LATE' });
    expect(s.phase).toBe('bonus-won');
    expect(canAcceptLateBonus(s)).toBe(false);
  });

  it('BONUS_TIME_UP only counts while the clock is running', () => {
    const s = ready();
    expect(wheelReduce(s, { type: 'BONUS_TIME_UP' })).toBe(s);
    expect(wheelReduce(s, { type: 'BONUS_ACCEPT_LATE' })).toBe(s);
  });

  it('"5. The envelope is opened win or lose."', () => {
    for (const verdict of ['won', 'lost'] as const) {
      let s = run(ready(), { type: 'CONTINUE' });
      s = run(s, verdict === 'won' ? { type: 'BONUS_SOLVE', verdict: 'correct' } : { type: 'BONUS_TIME_UP' });
      expect(wheelReduce(s, { type: 'CONTINUE' })).toBe(s); // not before the envelope is opened
      s = run(s, { type: 'BONUS_OPEN_ENVELOPE' });
      expect(s.phase).toBe('bonus-opened');
      expect(audienceView(s).bonus?.prize).toEqual({ kind: 'cash', value: 90000 });
      expect(wheelReduce(s, { type: 'BONUS_OPEN_ENVELOPE' })).toBe(s);
      s = run(s, { type: 'CONTINUE' });
      expect(s.stage).toBe('game-over');
    }
  });

  it('the host reversing a Bonus ruling puts the guess back', () => {
    let s = run(ready(), { type: 'CONTINUE' }, { type: 'BONUS_SOLVE', verdict: 'correct' });
    s = run(s, { type: 'HOST_SOLVE_OVERRIDE', verdict: 'wrong' });
    expect(s.phase).toBe('bonus-solving');
    s = run(s, { type: 'HOST_SOLVE_OVERRIDE', verdict: 'correct' });
    expect(s.phase).toBe('bonus-won');
  });

  it('a thrown-out Bonus puzzle is replaced in the chosen category and the called letters are kept', () => {
    let s = ready();
    s = run(s, { type: 'THROW_OUT_PUZZLE' });
    expect(s.phase).toBe('awaiting-puzzles');
    expect(s.request).toEqual({ use: 'bonus', count: 1, category: 'PHRASE' });
    s = provide(s, [
      makePuzzle('FAMOUS LAST WORDS', {
        category: 'PHRASE',
        use: ['bonus'],
        lines: ['FAMOUS LAST', 'WORDS'],
      }),
    ]);
    expect(s.phase).toBe('bonus-ready');
    expect(s.puzzle?.puzzle.phrase).toBe('FAMOUS LAST WORDS');
    expect(s.puzzle?.called).toEqual(['R', 'S', 'T', 'L', 'N', 'E', 'C', 'P', 'M', 'A']);
  });
});

describe('How it maps to the event', () => {
  it('"$100 of Wheel money is 1 point ... rounded, for every team."', () => {
    let s = mainGameDone({ 1: 12_349, 2: 4_050, 3: 1_000 }, { ...SHORT, bonusRound: false });
    s = run(s, { type: 'CONTINUE' });
    expect(gameResult(s)).toEqual({ winnerId: 1, score: 123, extraScores: { 2: 41, 3: 10 }, bonusChips: 0 });
  });

  it('"The Bonus Round prize is not added ... winning the Bonus Round earns a bonus Plinko chip instead."', () => {
    let s = atBonus();
    s = run(s, { type: 'BONUS_PICK_CATEGORY', category: 'PHRASE' }, { type: 'BONUS_SPIN', draw: 0.5 });
    s = run(
      s,
      { type: 'BONUS_SOLVE', verdict: 'correct' },
      { type: 'BONUS_OPEN_ENVELOPE' },
      { type: 'CONTINUE' },
    );
    const result = gameResult(s);
    expect(result).toEqual({ winnerId: 1, score: 90, extraScores: { 2: 30, 3: 10 }, bonusChips: 1 });
    expect(team(s, 1).bank).toBe(9000);
  });

  it('a lost Bonus Round earns no bonus chip', () => {
    let s = atBonus();
    s = run(s, { type: 'BONUS_PICK_CATEGORY', category: 'PHRASE' }, { type: 'BONUS_SPIN', draw: 0.5 });
    s = run(
      s,
      ...(['C', 'P', 'M', 'A'] as const).map((letter) => ({ type: 'BONUS_CALL_LETTER' as const, letter })),
    );
    s = run(
      s,
      { type: 'CONTINUE' },
      { type: 'BONUS_TIME_UP' },
      { type: 'BONUS_OPEN_ENVELOPE' },
      { type: 'CONTINUE' },
    );
    expect(gameResult(s)?.bonusChips).toBe(0);
  });

  it('there is no result before the game is over', () => {
    expect(gameResult(newGame())).toBeNull();
  });

  it('"The points come from each team\'s main-game total: banked cash plus the value of the prizes won ... with the tiebreaker and consolation $1,000 included."', () => {
    // a trip banked as prize value is part of the bank (the Round 3 Prize Puzzle test checks the amount)
    let s = mainGameDone({ 1: 0, 2: 7800, 3: 7800 }, { ...SHORT, bonusRound: false });
    s = run(s, { type: 'CONTINUE' }); // consolation to team 1, then a tiebreaker for 2 and 3
    expect(team(s, 1).bank).toBe(1000);
    s = provide(s);
    s = run(
      s,
      { type: 'TOSSUP_REVEAL_NEXT', draw: 0 },
      { type: 'BUZZ', team: 3, at: 1 },
      { type: 'TOSSUP_ANSWER', team: 3, verdict: 'correct' },
      { type: 'CONTINUE' },
    );
    expect(gameResult(s)).toEqual({ winnerId: 3, score: 88, extraScores: { 1: 10, 2: 78 }, bonusChips: 0 });
  });
});
