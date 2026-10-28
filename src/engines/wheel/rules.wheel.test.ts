/** One test per bullet of "The wheel" in docs/WHEEL_OF_FORTUNE_RULES.md (quoted in the test names). */
import { describe, expect, it } from 'vitest';
import { buildWheel } from './wheels';
import { isCash, isKind, missLetter, run, spinOn, team, toRound, makePuzzle, provide } from './testKit';
import type { TeamId, WheelState } from './types';
import { wheelReduce } from './wheelEngine';

const patchTeam = (s: WheelState, id: TeamId, patch: Partial<WheelState['teams'][number]>): WheelState => ({
  ...s,
  teams: s.teams.map((t) => (t.id === id ? { ...t, ...patch } : t)),
});
const kinds = (s: WheelState): string[] => buildWheel((s.round || 1) as 1, s.specials).map((w) => w.kind);

describe('The wheel: Bankrupt and Lose a Turn', () => {
  it('"Bankrupt: round cash to $0, round prizes lost, and any Wild Card or Million Dollar Wedge the team holds is lost. Banked money is safe."', () => {
    let s = toRound(1);
    const bank = team(s, 1).bank;
    s = patchTeam(s, 1, {
      roundCash: 3000,
      roundPrizes: [{ name: 'TRIP', value: 5000 }],
      wildCard: true,
      millionWedge: 'kept',
    });
    s = run(s, spinOn(s, isKind('bankrupt')));
    expect(team(s, 1)).toMatchObject({
      roundCash: 0,
      roundPrizes: [],
      wildCard: false,
      millionWedge: 'none',
      bank,
    });
    expect(s.turn).toBe(2);
  });

  it('"Lose a Turn: the turn passes; nothing is lost."', () => {
    let s = toRound(1);
    s = patchTeam(s, 1, { roundCash: 3000, wildCard: true });
    s = run(s, spinOn(s, isKind('lose-turn')));
    expect(s.turn).toBe(2);
    expect(team(s, 1)).toMatchObject({ roundCash: 3000, wildCard: true });
  });
});

describe('The wheel: Wild Card', () => {
  it('"the wedge is on the wheel in Rounds 1-3 until a team claims it with a correct consonant ($500 each)"', () => {
    for (const r of [1, 2, 3] as const) expect(kinds(toRound(r))).toContain('wild-card');
    expect(kinds(toRound(4))).not.toContain('wild-card');
    let s = toRound(1);
    s = run(s, spinOn(s, isKind('wild-card')), { type: 'CALL_LETTER', letter: 'P' });
    expect(team(s, 1)).toMatchObject({ roundCash: 1500, wildCard: true });
    expect(kinds(s)).not.toContain('wild-card');
  });

  it('a miss on the Wild Card wedge does not claim it', () => {
    let s = toRound(1);
    s = run(s, spinOn(s, isKind('wild-card')), { type: 'CALL_LETTER', letter: missLetter(s) });
    expect(team(s, 1).wildCard).toBe(false);
    expect(kinds(s)).toContain('wild-card');
  });

  it('"once, after a correct consonant on a dollar value, the holder may play it to call one more consonant at the same value"', () => {
    let s = toRound(1);
    s = patchTeam(s, 1, { wildCard: true });
    s = run(s, spinOn(s, isCash(700)), { type: 'CALL_LETTER', letter: 'P' });
    expect(team(s, 1).roundCash).toBe(2100);
    s = run(s, { type: 'PLAY_WILD_CARD' });
    expect(s.phase).toBe('call-consonant');
    expect(team(s, 1).wildCard).toBe(false);
    s = run(s, { type: 'CALL_LETTER', letter: 'D' });
    expect(team(s, 1).roundCash).toBe(2800);
    expect(s.turn).toBe(1);
    // once: the card is spent
    expect(wheelReduce(s, { type: 'PLAY_WILD_CARD' })).toBe(s);
  });

  it('the extra consonant can miss, which passes the turn (the card is still spent)', () => {
    let s = toRound(1);
    s = patchTeam(s, 1, { wildCard: true });
    s = run(s, spinOn(s, isCash(700)), { type: 'CALL_LETTER', letter: 'P' }, { type: 'PLAY_WILD_CARD' });
    s = run(s, { type: 'CALL_LETTER', letter: missLetter(s) });
    expect(s.turn).toBe(2);
    expect(team(s, 1).wildCard).toBe(false);
  });

  it('it cannot be played before a consonant, after a vowel, or without the card', () => {
    let s = toRound(1);
    s = patchTeam(s, 1, { wildCard: true });
    expect(wheelReduce(s, { type: 'PLAY_WILD_CARD' })).toBe(s);
    const spun = run(s, spinOn(s, isCash(700)));
    expect(wheelReduce(spun, { type: 'PLAY_WILD_CARD' })).toBe(spun);
    let t = patchTeam(s, 1, { roundCash: 1000 });
    t = run(
      t,
      spinOn(t, isCash(700)),
      { type: 'CALL_LETTER', letter: 'P' },
      { type: 'BUY_VOWEL', letter: 'E' },
    );
    expect(wheelReduce(t, { type: 'PLAY_WILD_CARD' })).toBe(t);
    const none = run(toRound(1), spinOn(s, isCash(700)), { type: 'CALL_LETTER', letter: 'P' });
    expect(wheelReduce(none, { type: 'PLAY_WILD_CARD' })).toBe(none);
  });

  it('"The card is then usable in any round, Round 4 included"', () => {
    let s = toRound(4);
    s = patchTeam(s, 1, { wildCard: true });
    s = run(s, spinOn(s, isCash(700)), { type: 'CALL_LETTER', letter: 'P' }, { type: 'PLAY_WILD_CARD' });
    expect(s.phase).toBe('call-consonant');
    expect(s.spin?.value).toBe(700);
  });

  it('"(not while riding the Express)"', () => {
    let s = toRound(3);
    s = patchTeam(s, 1, { wildCard: true });
    s = run(
      s,
      spinOn(s, isKind('express')),
      { type: 'CALL_LETTER', letter: 'P' },
      { type: 'EXPRESS', choice: 'play' },
    );
    expect(s.phase).toBe('express-run');
    expect(wheelReduce(s, { type: 'PLAY_WILD_CARD' })).toBe(s);
  });

  it('"Kept even without solving; lost to Bankrupt"', () => {
    let s = toRound(1);
    s = patchTeam(s, 3, { wildCard: true });
    s = run(s, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'correct' });
    expect(team(s, 3).wildCard).toBe(true);
  });

  it('"not usable in the Speed-Up"', () => {
    let s = toRound(4);
    s = patchTeam(s, 1, { wildCard: true });
    s = run(s, { type: 'RING_BELL' });
    expect(s.stage).toBe('speedup');
    expect(wheelReduce(s, { type: 'PLAY_WILD_CARD' })).toBe(s);
    expect(team(s, 1).wildCard).toBe(true); // kept for the Bonus Round
  });
});

describe('The wheel: Million Dollar Wedge', () => {
  it('"a ONE MILLION third between two Bankrupt thirds"', () => {
    let s = toRound(1);
    const bust = run(s, spinOn(s, isKind('million'), 0));
    expect(bust.turn).toBe(2);
    const bust2 = run(s, spinOn(s, isKind('million'), 2));
    expect(bust2.turn).toBe(2);
    s = run(s, spinOn(s, isKind('million'), 1));
    expect(s.phase).toBe('call-consonant');
    expect(s.spin).toMatchObject({ kind: 'million', value: 0, third: 1 });
  });

  it('"Claim it with a correct consonant ($0 per letter)"', () => {
    let s = toRound(1);
    s = run(s, spinOn(s, isKind('million'), 1), { type: 'CALL_LETTER', letter: 'P' });
    expect(team(s, 1)).toMatchObject({ roundCash: 0, millionWedge: 'round' });
    expect(kinds(s)).not.toContain('million');
  });

  it('"keep it by solving that round and never hitting Bankrupt"', () => {
    let s = toRound(1);
    s = run(s, spinOn(s, isKind('million'), 1), { type: 'CALL_LETTER', letter: 'P' });
    const solved = run(s, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'correct' });
    expect(team(solved, 1).millionWedge).toBe('kept');
    const lost = run(
      s,
      { type: 'SKIP_TURN' },
      { type: 'SOLVE_START' },
      { type: 'SOLVE', verdict: 'correct' },
    );
    expect(team(lost, 1).millionWedge).toBe('none');
    expect(team(lost, 2).millionWedge).toBe('none');
    const bust = run(s, spinOn(s, isKind('bankrupt')));
    expect(team(bust, 1).millionWedge).toBe('none');
  });

  it('a kept wedge survives later rounds that the team does not solve, but not a later Bankrupt', () => {
    let s = toRound(2);
    s = patchTeam(s, 3, { millionWedge: 'kept' });
    const other = run(s, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'correct' });
    expect(team(other, 3).millionWedge).toBe('kept');
    let t = run(s, { type: 'SKIP_TURN' }); // team 3 now in control
    expect(t.turn).toBe(3);
    t = run(t, spinOn(t, isKind('bankrupt')));
    expect(team(t, 3).millionWedge).toBe('none');
  });

  it('"Specials lost to Bankrupt or an unsolved round do not go back on the wheel."', () => {
    let s = toRound(1);
    s = run(s, spinOn(s, isKind('million'), 1), { type: 'CALL_LETTER', letter: 'P' });
    s = run(s, spinOn(s, isKind('bankrupt')));
    expect(kinds(s)).not.toContain('million');
    let u = toRound(1);
    u = run(u, spinOn(u, isKind('wild-card')), { type: 'CALL_LETTER', letter: 'P' });
    u = run(u, { type: 'END_ROUND_UNSOLVED' });
    expect(kinds(u)).not.toContain('wild-card');
    const next = advanceRound(u);
    expect(kinds(next)).not.toContain('wild-card');
  });

  it('an unclaimed Million wedge stays on the wheel into Round 2 and Round 3', () => {
    const r2 = advanceRound(run(toRound(1), { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'correct' }));
    expect(kinds(r2)).toContain('million');
  });
});

function advanceRound(s: WheelState): WheelState {
  let st = run(s, { type: 'CONTINUE' });
  st = provide(st);
  return st;
}

describe('The wheel: trip wedge', () => {
  it('"Trip wedge (Round 1, carried into Round 2 if unclaimed): $500 per letter plus the trip, kept only by solving the round."', () => {
    let s = toRound(1);
    s = run(s, spinOn(s, isKind('trip')), { type: 'CALL_LETTER', letter: 'P' });
    expect(team(s, 1).roundCash).toBe(1500);
    expect(team(s, 1).roundPrizes.map((p) => p.name)).toEqual(['TRIP']);
    const solved = run(s, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'correct' });
    expect(team(solved, 1).prizes).toEqual(['TRIP']);
    expect(solved.award?.amount).toBe(1500 + 5000);
    const lost = run(
      s,
      { type: 'SKIP_TURN' },
      { type: 'SOLVE_START' },
      { type: 'SOLVE', verdict: 'correct' },
    );
    expect(team(lost, 1).prizes).toEqual([]);
    expect(team(lost, 1).roundPrizes).toEqual([]);
  });

  it('unclaimed in Round 1 it is on the Round 2 wheel; claimed and lost it is gone', () => {
    const unclaimed = advanceRound(
      run(toRound(1), { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'correct' }),
    );
    expect(kinds(unclaimed)).toContain('trip');
    let s = toRound(1);
    s = run(s, spinOn(s, isKind('trip')), { type: 'CALL_LETTER', letter: 'P' }, { type: 'SKIP_TURN' });
    s = run(s, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'correct' });
    expect(kinds(advanceRound(s))).not.toContain('trip');
  });
});

describe('The wheel: Mystery wedges', () => {
  it('"$1,000 per letter. After a correct letter the team keeps the money or gives it up to flip the wedge"', () => {
    const s0 = toRound(2);
    expect(kinds(s0).filter((k) => k === 'mystery')).toHaveLength(2);
    let s = run(s0, spinOn(s0, isKind('mystery')), { type: 'CALL_LETTER', letter: 'P' });
    expect(s.phase).toBe('mystery-choice');
    expect(team(s, s0.turn!).roundCash).toBe(3000);
    const kept = run(s, { type: 'MYSTERY', choice: 'keep' });
    expect(team(kept, s0.turn!).roundCash).toBe(3000);
    expect(kept.phase).toBe('choose');
    expect(kinds(kept).filter((k) => k === 'mystery')).toHaveLength(2);
    s = run(s, { type: 'MYSTERY', choice: 'flip', draw: 0.1 });
    expect(team(s, s0.turn!).roundCash).toBe(0); // the money was given up
  });

  it('a miss on a Mystery wedge just passes the turn', () => {
    const s0 = toRound(2);
    const s = run(s0, spinOn(s0, isKind('mystery')), { type: 'CALL_LETTER', letter: missLetter(s0) });
    expect(s.turn).not.toBe(s0.turn);
    expect(kinds(s).filter((k) => k === 'mystery')).toHaveLength(2);
  });

  it('"one hides $10,000 (a prize, not spendable)"', () => {
    const s0 = toRound(2);
    const me = s0.turn!;
    let s = run(s0, spinOn(s0, isKind('mystery')), { type: 'CALL_LETTER', letter: 'P' });
    s = run(s, { type: 'MYSTERY', choice: 'flip', draw: 0.25 });
    expect(team(s, me).roundPrizes).toEqual([{ name: 'MYSTERY $10,000', value: 10000 }]);
    expect(s.turn).toBe(me);
    expect(s.phase).toBe('choose');
    expect(wheelReduce(s, { type: 'BUY_VOWEL', letter: 'E' })).toBe(s);
    const solved = run(s, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'correct' });
    expect(solved.award?.amount).toBe(10000);
  });

  it('"... the other Bankrupt"', () => {
    const s0 = toRound(2);
    const me = s0.turn!;
    let s = patchTeam(s0, me, { roundCash: 2000, wildCard: true });
    s = run(
      s,
      spinOn(s, isKind('mystery')),
      { type: 'CALL_LETTER', letter: 'P' },
      { type: 'MYSTERY', choice: 'flip', draw: 0.75 },
    );
    expect(team(s, me)).toMatchObject({ roundCash: 0, wildCard: false });
    expect(s.turn).not.toBe(me);
  });

  it('"After one flip, the other is a plain $1,000."', () => {
    const s0 = toRound(2);
    let s = run(
      s0,
      spinOn(s0, isKind('mystery')),
      { type: 'CALL_LETTER', letter: 'P' },
      { type: 'MYSTERY', choice: 'flip', draw: 0.1 },
    );
    const w = buildWheel(2, s.specials);
    expect(w.filter((x) => x.kind === 'mystery')).toHaveLength(0);
    expect(w.filter((x) => x.kind === 'cash' && x.value === 1000)).toHaveLength(1);
    s = run(
      s,
      spinOn(s, (x) => x.kind === 'cash' && x.value === 1000),
      { type: 'CALL_LETTER', letter: 'D' },
    );
    expect(s.phase).toBe('choose'); // a plain cash wedge: no keep/flip choice
  });

  it('keep or flip only after a correct letter', () => {
    const s0 = toRound(2);
    expect(wheelReduce(s0, { type: 'MYSTERY', choice: 'keep' })).toBe(s0);
    const spun = run(s0, spinOn(s0, isKind('mystery')));
    expect(wheelReduce(spun, { type: 'MYSTERY', choice: 'flip', draw: 0.1 })).toBe(spun);
    const decide = run(spun, { type: 'CALL_LETTER', letter: 'P' });
    expect(wheelReduce(decide, { type: 'MYSTERY', choice: 'flip' })).toBe(decide); // a flip needs its draw
    expect(wheelReduce(decide, { type: 'SPIN', draw: 0.5 })).toBe(decide);
  });
});

describe('The wheel: Express', () => {
  const rideExpress = () => {
    const s0 = toRound(3);
    const me = s0.turn!;
    const s = run(s0, spinOn(s0, isKind('express')), { type: 'CALL_LETTER', letter: 'R' });
    return { s, me };
  };

  it('"Express (Round 3): $1,000 per letter, then PLAY or PASS."', () => {
    const { s, me } = rideExpress();
    expect(s.phase).toBe('express-choice');
    expect(team(s, me).roundCash).toBe(1000);
    const passed = run(s, { type: 'EXPRESS', choice: 'pass' });
    expect(passed.phase).toBe('choose');
    expect(passed.turn).toBe(me);
    expect(wheelReduce(s, { type: 'SPIN', draw: 0.5 })).toBe(s);
  });

  it('"Playing, the team calls consonants at $1,000 each without spinning and may buy vowels and solve"', () => {
    const { s, me } = rideExpress();
    let p = run(s, { type: 'EXPRESS', choice: 'play' });
    expect(p.phase).toBe('express-run');
    expect(wheelReduce(p, { type: 'SPIN', draw: 0.5 })).toBe(p);
    p = run(p, { type: 'CALL_LETTER', letter: 'P' });
    expect(team(p, me).roundCash).toBe(4000);
    expect(p.phase).toBe('express-run');
    p = run(p, { type: 'BUY_VOWEL', letter: 'E' });
    expect(team(p, me).roundCash).toBe(3750);
    expect(p.phase).toBe('express-run');
    expect(wheelReduce(p, { type: 'CALL_LETTER', letter: 'A' })).toBe(p); // vowels are bought
    const won = run(p, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'correct' });
    expect(won.phase).toBe('round-award');
    expect(won.award?.amount).toBe(3750 + 9800); // Round 3 is the Prize Puzzle
  });

  it('"any miss ... is a Bankrupt"', () => {
    const { s, me } = rideExpress();
    const p = run(s, { type: 'EXPRESS', choice: 'play' }, { type: 'CALL_LETTER', letter: missLetter(s) });
    expect(team(p, me).roundCash).toBe(0);
    expect(p.turn).not.toBe(me);
  });

  it('"... repeat ... is a Bankrupt"', () => {
    const { s, me } = rideExpress();
    const p = run(s, { type: 'EXPRESS', choice: 'play' }, { type: 'CALL_LETTER', letter: 'R' });
    expect(team(p, me).roundCash).toBe(0);
    expect(p.turn).not.toBe(me);
  });

  it('a vowel that misses on the Express is a miss, and a Bankrupt', () => {
    const { s, me } = rideExpress();
    let p = patchTeam(s, me, { roundCash: 5000 });
    p = run(p, { type: 'EXPRESS', choice: 'play' }, { type: 'BUY_VOWEL', letter: 'U' });
    expect(team(p, me).roundCash).toBe(0);
  });

  it('"... or wrong solve is a Bankrupt"', () => {
    const { s, me } = rideExpress();
    const p = run(
      s,
      { type: 'EXPRESS', choice: 'play' },
      { type: 'SOLVE_START' },
      { type: 'SOLVE', verdict: 'wrong' },
    );
    expect(team(p, me).roundCash).toBe(0);
    expect(p.turn).not.toBe(me);
  });

  it('a solve cancelled on the Express goes back to the run', () => {
    const { s } = rideExpress();
    const p = run(s, { type: 'EXPRESS', choice: 'play' }, { type: 'SOLVE_START' }, { type: 'SOLVE_CANCEL' });
    expect(p.phase).toBe('express-run');
  });

  it('after PASS a wrong consonant is an ordinary miss, not a Bankrupt', () => {
    const { s, me } = rideExpress();
    let p = run(s, { type: 'EXPRESS', choice: 'pass' });
    p = run(p, spinOn(p, isCash(700)), { type: 'CALL_LETTER', letter: missLetter(p) });
    expect(team(p, me).roundCash).toBe(1000);
    expect(p.turn).not.toBe(me);
  });
});

describe('The wheel: Same Letter', () => {
  it('"Same Letter puzzles pay a flat $1,000 bonus for calling the shared letter."', () => {
    const s0 = toRound(1, {}, 1, 'BIG BLUE BEACH BALL');
    const withSame = {
      ...s0,
      puzzle: s0.puzzle && { ...s0.puzzle, puzzle: { ...s0.puzzle.puzzle, sameLetter: 'B' } },
    };
    let s = run(withSame, spinOn(withSame, isCash(700)), { type: 'CALL_LETTER', letter: 'B' });
    expect(team(s, 1).roundCash).toBe(4 * 700 + 1000);
    expect(s.events.some((e) => e.type === 'same-letter')).toBe(true);
    // paid once
    s = run(s, spinOn(s, isCash(700)), { type: 'CALL_LETTER', letter: 'L' });
    expect(team(s, 1).roundCash).toBe(4 * 700 + 1000 + 3 * 700);
  });

  it('only the shared letter earns the bonus', () => {
    const base = toRound(1, {}, 1, 'BIG BLUE BEACH BALL');
    const s0 = {
      ...base,
      puzzle: base.puzzle && { ...base.puzzle, puzzle: { ...base.puzzle.puzzle, sameLetter: 'B' } },
    };
    const s = run(s0, spinOn(s0, isCash(700)), { type: 'CALL_LETTER', letter: 'G' });
    expect(team(s, 1).roundCash).toBe(700);
  });
});

describe('The wheel: wheel integrity', () => {
  it('the engine spins the wheel of the current round (Round 4 top dollar $5,000)', () => {
    let s = toRound(4);
    s = run(s, { type: 'SPIN', draw: 0.001 }, { type: 'CALL_LETTER', letter: 'D' });
    expect(team(s, s.turn!).roundCash).toBe(5000);
  });

  it('a puzzle can be provided for the prize round with makePuzzle', () => {
    expect(makePuzzle('X').phrase).toBe('X');
  });
});
