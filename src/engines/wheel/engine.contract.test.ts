/** The engine contract (design 8.2, conventions): same object for illegal actions, bounded undo, leak-free views. */
import { describe, expect, it } from 'vitest';
import { HISTORY_LIMIT } from './engineCore';
import { KEEPS_TIMED_OUT, createWheelState, wheelReduce } from './wheelEngine';
import {
  audienceView,
  canLateSolve,
  hostView,
  legalActions,
  legalLetters,
  lockedOut,
  phoneControls,
} from './selectors';
import {
  TEAMS,
  autoplay,
  isCash,
  makePuzzle,
  newGame,
  provide,
  puzzlesFor,
  run,
  spinOn,
  toRound,
} from './testKit';
import type { WheelAction, WheelActionType, WheelSettings, WheelState } from './types';

describe('illegal actions return the same object', () => {
  const s = toRound(1);
  const waiting = createWheelState({ teams: TEAMS });

  it.each<[string, WheelState, WheelAction]>([
    ['SPIN while the engine waits for puzzles', waiting, { type: 'SPIN', draw: 0.5 }],
    ['CONTINUE while waiting', waiting, { type: 'CONTINUE' }],
    ['CALL_LETTER before a spin', s, { type: 'CALL_LETTER', letter: 'P' }],
    ['CALL_LETTER with a non-letter', run(s, spinOn(s, isCash(700))), { type: 'CALL_LETTER', letter: '1' }],
    ['BUY_VOWEL with no money', s, { type: 'BUY_VOWEL', letter: 'E' }],
    [
      'BUY_VOWEL with a consonant',
      { ...s, teams: s.teams.map((t) => ({ ...t, roundCash: 900 })) },
      { type: 'BUY_VOWEL', letter: 'P' },
    ],
    ['SOLVE when nobody is solving', s, { type: 'SOLVE', verdict: 'correct' }],
    ['SOLVE_CANCEL when nobody is solving', s, { type: 'SOLVE_CANCEL' }],
    ['SPEEDUP_SPIN in a round', s, { type: 'SPEEDUP_SPIN', draw: 0.5 }],
    ['SPIN with a NaN draw', s, { type: 'SPIN', draw: Number.NaN }],
    ['BUZZ in a round', s, { type: 'BUZZ', team: 1, at: 1 }],
    ['TOSSUP_REVEAL_NEXT in a round', s, { type: 'TOSSUP_REVEAL_NEXT', draw: 0.5 }],
    ['FRENZY_TICK outside Frenzy', s, { type: 'FRENZY_TICK', ms: 1000 }],
    ['PLAY_WILD_CARD without a card', s, { type: 'PLAY_WILD_CARD' }],
    ['MYSTERY with nothing to decide', s, { type: 'MYSTERY', choice: 'keep' }],
    ['EXPRESS with nothing to decide', s, { type: 'EXPRESS', choice: 'play' }],
    ['TIME_OUT for a team not in control', s, { type: 'TIME_OUT', team: 3 }],
    ['TIME_OUT for an unknown team', s, { type: 'TIME_OUT', team: 99 }],
    ['LATE_SOLVE with no time-out', s, { type: 'LATE_SOLVE' }],
    ['HOST_SOLVE_OVERRIDE with nothing to override', s, { type: 'HOST_SOLVE_OVERRIDE', verdict: 'wrong' }],
    ['SET_TURN to an unknown team', s, { type: 'SET_TURN', team: 99 }],
    ['SET_TURN to the team already in control', s, { type: 'SET_TURN', team: 1 }],
    ['ADJUST_BANK by zero', s, { type: 'ADJUST_BANK', team: 1, delta: 0 }],
    ['ADJUST_BANK for an unknown team', s, { type: 'ADJUST_BANK', team: 99, delta: 100 }],
    [
      'ADJUST_BANK below zero when already at zero',
      { ...s, teams: s.teams.map((t) => ({ ...t, bank: 0 })) },
      { type: 'ADJUST_BANK', team: 1, delta: -500 },
    ],
    ['PROVIDE_PUZZLES with no request', s, { type: 'PROVIDE_PUZZLES', puzzles: [makePuzzle('HELLO')] }],
    ['BONUS_* in a round', s, { type: 'BONUS_SPIN', draw: 0.5 }],
    ['BONUS_OPEN_ENVELOPE in a round', s, { type: 'BONUS_OPEN_ENVELOPE' }],
    ['END_ROUND_UNSOLVED while waiting', waiting, { type: 'END_ROUND_UNSOLVED' }],
    ['THROW_OUT_PUZZLE while waiting', waiting, { type: 'THROW_OUT_PUZZLE' }],
    ['UNDO with no history', waiting, { type: 'UNDO' }],
    ['LIGHT_NEXT with nothing queued', s, { type: 'LIGHT_NEXT' }],
    ['SET_TURN_TIMER to the current value', s, { type: 'SET_TURN_TIMER', sec: 0 }],
  ])('%s', (_name, state, action) => {
    expect(wheelReduce(state, action)).toBe(state);
  });

  it('a legal action never returns the same object, and a changed state is a new object (inputs are not mutated)', () => {
    const before = JSON.stringify(s);
    const next = wheelReduce(s, { type: 'SOLVE_START' });
    expect(next).not.toBe(s);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('game over accepts nothing but UNDO', () => {
    const over = autoplay(newGame({ length: 'short', bonusRound: false }), (st) => st.stage === 'game-over');
    expect(over.stage).toBe('game-over');
    expect(legalActions(over).filter((t) => t !== 'UNDO' && t !== 'SET_TURN_TIMER')).toEqual([]);
  });
});

describe('undo', () => {
  it('"history 30": the history is bounded and UNDO steps back one action at a time', () => {
    let s = toRound(1);
    const trail: WheelState[] = [s];
    for (let i = 0; i < 40; i++) {
      s = run(s, { type: 'SKIP_TURN' });
      trail.push(s);
    }
    expect(s.history).toHaveLength(HISTORY_LIMIT);
    expect(HISTORY_LIMIT).toBe(30);
    for (let i = 0; i < 30; i++) {
      const back = run(s, { type: 'UNDO' });
      const want = trail[trail.length - 2 - i];
      expect(back.turn).toBe(want?.turn);
      expect(back.history).toHaveLength(s.history.length - 1);
      s = back;
    }
    expect(s.history).toHaveLength(0);
    expect(wheelReduce(s, { type: 'UNDO' })).toBe(s);
  });

  it('undo restores the state before the action (events excepted)', () => {
    const s0 = toRound(1);
    const s1 = run(s0, spinOn(s0, isCash(700)), { type: 'CALL_LETTER', letter: 'P' });
    const back = run(s1, { type: 'UNDO' }, { type: 'UNDO' });
    expect({ ...back, events: [], eventSeq: 0 }).toEqual({ ...s0, events: [], eventSeq: 0 });
  });

  it('events are never rewound: seq keeps climbing through an undo', () => {
    const s0 = toRound(1);
    const s1 = run(s0, spinOn(s0, isCash(700)), { type: 'CALL_LETTER', letter: 'P' });
    const back = run(s1, { type: 'UNDO' });
    expect(back.eventSeq).toBeGreaterThan(s1.eventSeq);
    expect(back.events.slice(0, s1.events.length)).toEqual(s1.events);
    expect(back.events[back.events.length - 1]?.type).toBe('undo');
    const seqs = back.events.map((e) => e.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it('the turn timer, lighting and the Frenzy clock are not undo steps', () => {
    const s0 = toRound(1);
    const timer = run(s0, { type: 'SET_TURN_TIMER', sec: 10 });
    expect(timer.history).toHaveLength(s0.history.length);
    expect(timer.step).toBe(s0.step);
    const lit = run(s0, spinOn(s0, isCash(700)), { type: 'CALL_LETTER', letter: 'P' });
    const stepBefore = lit.step;
    const light = run(lit, { type: 'LIGHT_NEXT' });
    expect(light.step).toBe(stepBefore);
    expect(light.puzzle?.shown.filter(Boolean)).toHaveLength(1);
    const f = newGame({ opening: 'frenzy' });
    const ticked = run(f, { type: 'TOSSUP_REVEAL_NEXT', draw: 0 }, { type: 'FRENZY_TICK', ms: 4000 });
    expect(ticked.history).toHaveLength(f.history.length);
  });

  it('undoing a step keeps the toss-up letters already shown and the Frenzy clock', () => {
    let f = newGame({ opening: 'frenzy' });
    f = run(
      f,
      { type: 'TOSSUP_REVEAL_NEXT', draw: 0 },
      { type: 'BUZZ', team: 1, at: 1 },
      { type: 'FRENZY_TICK', ms: 4000 },
    );
    const back = run(f, { type: 'UNDO' });
    expect(back.phase).toBe('tossup-reveal');
    expect(back.frenzy?.msLeft).toBe(26000);
  });
});

describe('views do not leak', () => {
  const letters = (s: WheelState): string => {
    const view = audienceView(s);
    return (view.board ?? [])
      .flat()
      .flatMap((c) => (c.kind === 'tile' && c.char ? [c.char] : []))
      .join('');
  };

  it('the audience view carries no unrevealed puzzle letter, no phrase and no next puzzle', () => {
    let s = toRound(1, {}, 1, 'SECRET GARDEN');
    s = { ...s, queue: [makePuzzle('UPCOMING ANSWER')] };
    const check = (st: WheelState) => {
      const json = JSON.stringify(audienceView(st));
      expect(json).not.toContain('SECRET');
      expect(json).not.toContain('GARDEN');
      expect(json).not.toContain('UPCOMING');
      expect(json).not.toContain('"phrase"');
      expect(json).not.toContain('"lines"');
      const view = audienceView(st);
      for (const c of (view.board ?? []).flat()) if (c.kind === 'tile' && !c.lit) expect(c.char).toBeNull();
    };
    check(s);
    s = run(s, spinOn(s, isCash(700)), { type: 'CALL_LETTER', letter: 'R' });
    check(s);
    // R has been called but its tiles are not lit yet: still hidden
    expect(letters(s)).toBe('');
    expect(audienceView(s).pendingLights).toBe(2);
    expect(audienceView(s).called).toEqual(['R']);
    s = run(s, { type: 'LIGHT_NEXT' });
    check(s);
    expect(letters(s)).toBe('R');
    s = run(s, { type: 'LIGHT_ALL' });
    expect(letters(s)).toBe('RR');
    // the host view has it all
    const host = hostView(s);
    expect(host.puzzle?.phrase).toBe('SECRET GARDEN');
    expect(host.nextPuzzle?.phrase).toBe('UPCOMING ANSWER');
    expect(host.puzzle?.lines).toEqual(['SECRET GARDEN']);
  });

  it('a toss-up shows only the tiles that have appeared', () => {
    let s = newGame();
    s = run(s, { type: 'TOSSUP_REVEAL_NEXT', draw: 0.9 }, { type: 'TOSSUP_REVEAL_NEXT', draw: 0.1 });
    const shownChars = (s.puzzle?.tiles ?? [])
      .filter((_, i) => s.puzzle?.shown[i])
      .map((t) => t.char)
      .sort()
      .join('');
    expect(letters(s).split('').sort().join('')).toBe(shownChars);
    expect(JSON.stringify(audienceView(s))).not.toContain(s.puzzle?.puzzle.phrase ?? 'x');
  });

  it('the category is visible; the Prize Puzzle prize is not named until it is won', () => {
    const s = toRound(3);
    const view = audienceView(s);
    expect(view.category).toBe('THING');
    expect(view.prizePuzzle).toBe(true);
    expect(JSON.stringify(view)).not.toContain('MAUI');
    const won = run(s, { type: 'SOLVE_START' }, { type: 'SOLVE', verdict: 'correct' });
    expect(audienceView(won).award?.prizes[0]?.name).toBe('A TRIP TO MAUI');
  });

  it('the Bonus Round: the options, the chosen phrase and the envelope stay hidden', () => {
    let s = autoplay(newGame({ length: 'short' }), (st) => st.stage === 'bonus');
    s = provide(s, [
      makePuzzle('HIDDEN ONE', { category: 'A', use: ['bonus'] }),
      makePuzzle('HIDDEN TWO', { category: 'B', use: ['bonus'] }),
      makePuzzle('HIDDEN TRE', { category: 'C', use: ['bonus'] }),
    ]);
    const json = JSON.stringify(audienceView(s));
    expect(json).not.toContain('HIDDEN');
    s = run(s, { type: 'BONUS_PICK_CATEGORY', category: 'B' }, { type: 'BONUS_SPIN', draw: 0.1 });
    expect(JSON.stringify(audienceView(s))).not.toContain('HIDDEN');
    expect(audienceView(s).bonus?.prize).toBeNull();
    expect(hostView(s).envelope).not.toBeNull();
  });

  it('the audience view is plain data', () => {
    const v = audienceView(toRound(2));
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
    expect(v.wheel).toHaveLength(24);
  });
});

describe('selectors', () => {
  it('legalActions lists what the engine would accept', () => {
    const s = toRound(1);
    const legal = legalActions(s);
    expect(legal).toEqual(
      expect.arrayContaining([
        'SPIN',
        'SOLVE_START',
        'SKIP_TURN',
        'SET_TURN',
        'THROW_OUT_PUZZLE',
        'END_ROUND_UNSOLVED',
        'ADJUST_BANK',
        'RING_BELL',
        'UNDO',
      ]),
    );
    expect(legal).not.toContain('BUY_VOWEL'); // no money yet
    expect(legal).not.toContain('CALL_LETTER');
    expect(legal).not.toContain('BUZZ');
    const spun = run(s, spinOn(s, isCash(700)));
    expect(legalActions(spun)).toContain('CALL_LETTER');
    expect(legalActions(spun)).not.toContain('SPIN');
    expect(legalLetters(spun).call).not.toContain('E');
    expect(legalLetters(spun).call).toContain('P');
    const toss = newGame();
    expect(legalActions(toss)).toContain('TOSSUP_REVEAL_NEXT');
    expect(legalActions(toss)).not.toContain('BUZZ');
    expect(legalActions(run(toss, { type: 'TOSSUP_REVEAL_NEXT', draw: 0 }))).toContain('BUZZ');
    const waiting = createWheelState({ teams: TEAMS });
    expect(legalActions(waiting)).toContain('PROVIDE_PUZZLES');
  });

  it('phoneControls: the team in control, what it can press, and why the rest is off', () => {
    let s = toRound(1);
    expect(phoneControls(s)).toEqual({
      activeTeam: 1,
      canBuy: false,
      canSpin: true,
      canSolve: true,
      turnName: 'Red',
    });
    s = run(s, spinOn(s, isCash(700)));
    expect(phoneControls(s)).toMatchObject({ activeTeam: 1, canSpin: false, canSolve: true });
    expect(phoneControls(s).offLabel).toBeUndefined();
    s = run(s, { type: 'CALL_LETTER', letter: 'P' });
    expect(phoneControls(s)).toMatchObject({ canBuy: true, canSpin: true, canSolve: true });
    s = run(s, { type: 'SOLVE_START' });
    expect(phoneControls(s)).toMatchObject({
      canBuy: false,
      canSpin: false,
      canSolve: false,
      offLabel: 'SOLVING',
    });
    const bell = run(toRound(4), { type: 'RING_BELL' });
    expect(phoneControls(bell).canSpin).toBe(true);
  });

  it('lockedOut and canLateSolve', () => {
    let s = run(
      newGame(),
      { type: 'TOSSUP_REVEAL_NEXT', draw: 0 },
      { type: 'BUZZ', team: 2, at: 1 },
      { type: 'TOSSUP_ANSWER', team: 2, verdict: 'wrong' },
    );
    expect(lockedOut(s, 2)).toBe(true);
    expect(lockedOut(s, 1)).toBe(false);
    expect(lockedOut(s, 99)).toBe(false);
    const r = toRound(1);
    expect(canLateSolve(r)).toBe(false);
    s = run(r, { type: 'TIME_OUT', team: 1 });
    expect(canLateSolve(s)).toBe(true);
  });

  it('hostView lists the legal actions and the pending puzzle request', () => {
    const waiting = createWheelState({ teams: TEAMS });
    expect(hostView(waiting).request).toEqual({ use: 'tossup', count: 2 });
    expect(hostView(waiting).puzzle).toBeNull();
    const s = toRound(1);
    expect(hostView(s).legalActions).toEqual(legalActions(s));
    expect(hostView(s).consonantsLeft).toBe(4);
    expect(hostView(s).vowelsLeft).toBe(3);
    expect(hostView(s).canUndo).toBe(true);
  });
});

describe('late solve window (FR-044)', () => {
  it('"LATE_SOLVE legality via timedOut cleared by any action outside a KEEPS_TIMED_OUT set"', () => {
    const timed = run(toRound(1), { type: 'TIME_OUT', team: 1 });
    expect(KEEPS_TIMED_OUT).toContain('ADJUST_BANK');
    expect(KEEPS_TIMED_OUT).toContain('SET_TURN_TIMER');
    // actions in the set keep it
    const kept = run(timed, { type: 'ADJUST_BANK', team: 3, delta: 500 }, { type: 'SET_TURN_TIMER', sec: 5 });
    expect(kept.timedOut).toBe(1);
    expect(canLateSolve(kept)).toBe(true);
    // the team that got the turn acts, or the host skips: gone
    for (const action of [
      { type: 'SKIP_TURN' },
      { type: 'SET_TURN', team: 3 },
      { type: 'SOLVE_START' },
      { type: 'THROW_OUT_PUZZLE' },
    ] as WheelAction[]) {
      const after = run(timed, action);
      expect(after.timedOut).toBeNull();
      expect(canLateSolve(after)).toBe(false);
    }
  });

  it('a late solve cannot be repeated', () => {
    const late = run(toRound(1), { type: 'TIME_OUT', team: 1 }, { type: 'LATE_SOLVE' });
    expect(wheelReduce(late, { type: 'LATE_SOLVE' })).toBe(late);
    expect(late.timedOut).toBeNull();
  });
});

describe('determinism and plain data', () => {
  it('the same actions give the same state', () => {
    const play = (): WheelState => {
      const s = toRound(2);
      return run(
        s,
        { type: 'SPIN', draw: 0.31 },
        { type: 'CALL_LETTER', letter: 'P' },
        { type: 'SPIN', draw: 0.77 },
      );
    };
    // fixtures are consumed from a global counter, so compare the engine-owned parts
    const a = play();
    const b = play();
    expect(a.teams.map((t) => t.roundCash)).toEqual(b.teams.map((t) => t.roundCash));
    expect(a.turn).toBe(b.turn);
    expect(a.phase).toBe(b.phase);
  });

  it('puzzlesFor is only a fixture: the engine never picks content itself', () => {
    expect(puzzlesFor({ use: 'round', count: 2 })).toHaveLength(2);
    const s = createWheelState({ teams: TEAMS });
    expect(s.queue).toEqual([]);
    expect(s.puzzle).toBeNull();
  });
});

/** A seeded random walk through every kind of action: invariants hold and nothing throws. */
function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

const PREFERRED: WheelActionType[] = [
  'PROVIDE_PUZZLES',
  'CONTINUE',
  'SPIN',
  'SPEEDUP_SPIN',
  'CALL_LETTER',
  'SOLVE_START',
  'SOLVE',
  'TOSSUP_REVEAL_NEXT',
  'BUZZ',
  'TOSSUP_ANSWER',
  'MYSTERY',
  'EXPRESS',
  'BONUS_PICK_CATEGORY',
  'BONUS_SPIN',
  'BONUS_CALL_LETTER',
  'BONUS_SOLVE',
  'BONUS_OPEN_ENVELOPE',
  'BUY_VOWEL',
  'FRENZY_TICK',
  'PLAY_WILD_CARD',
  'LIGHT_NEXT',
];

function randomAction(s: WheelState, r: () => number): WheelAction | null {
  const legal = legalActions(s);
  const pref = legal.filter((t) => PREFERRED.includes(t));
  const pool = r() < 0.85 && pref.length > 0 ? pref : legal;
  const type = pool[Math.floor(r() * pool.length)];
  if (!type) return null;
  const pick = <T>(xs: T[]): T | undefined => xs[Math.floor(r() * xs.length)];
  const verdict = r() < 0.55 ? ('correct' as const) : ('wrong' as const);
  const letters = legalLetters(s);
  switch (type) {
    case 'SPIN':
    case 'SPEEDUP_SPIN':
    case 'BONUS_SPIN':
    case 'TOSSUP_REVEAL_NEXT':
      return { type, draw: r() };
    case 'CALL_LETTER':
      return { type, letter: pick(letters.call) ?? 'Z' };
    case 'BUY_VOWEL':
      return { type, letter: pick(letters.buy) ?? 'A' };
    case 'BONUS_CALL_LETTER':
      return { type, letter: pick(letters.bonus) ?? 'Z' };
    case 'SOLVE':
    case 'HOST_SOLVE_OVERRIDE':
    case 'BONUS_SOLVE':
      return { type, verdict };
    case 'TOSSUP_ANSWER':
      return s.tossup?.buzzed != null ? { type, team: s.tossup.buzzed, verdict } : null;
    case 'BUZZ':
      return { type, team: pick(s.teams.map((t) => t.id)) ?? 1, at: Math.floor(r() * 1000) };
    case 'MYSTERY':
      return { type, choice: r() < 0.5 ? 'keep' : 'flip', draw: r() };
    case 'EXPRESS':
      return { type, choice: r() < 0.5 ? 'play' : 'pass' };
    case 'TIME_OUT':
      return { type, team: s.turn ?? 1 };
    case 'SET_TURN':
      return { type, team: pick(s.teams.map((t) => t.id)) ?? 1 };
    case 'ADJUST_BANK':
      return { type, team: pick(s.teams.map((t) => t.id)) ?? 1, delta: Math.floor(r() * 4000) - 1500 };
    case 'SET_TURN_TIMER':
      return { type, sec: pick<0 | 5 | 10>([0, 5, 10]) ?? 0 };
    case 'FRENZY_TICK':
      return { type, ms: 500 + Math.floor(r() * 3000) };
    case 'PROVIDE_PUZZLES':
      return s.request ? { type, puzzles: puzzlesFor(s.request) } : null;
    case 'BONUS_PICK_CATEGORY':
      return { type, category: pick(s.bonus?.options.map((p) => p.category) ?? []) ?? 'X' };
    default:
      return { type };
  }
}

describe('random walks', () => {
  const variants: Partial<WheelSettings>[] = [
    {},
    { opening: 'frenzy' },
    { length: 'short' },
    { speedUpStart: 'round4' },
    { length: 'short', opening: 'frenzy', bonusRound: false },
  ];
  it('keep every invariant over thousands of random legal and illegal steps', { timeout: 180_000 }, () => {
    let reachedBonus = 0;
    let reachedOver = 0;
    variants.forEach((settings, v) => {
      for (let seed = 1; seed <= 4; seed++) {
        const r = lcg(seed * 7919 + v);
        let s = createWheelState({ teams: TEAMS, settings });
        let lastSeq = 0;
        for (let i = 0; i < 700; i++) {
          const a = randomAction(s, r);
          if (!a) break;
          const next = wheelReduce(s, a);
          // plain data: survives JSON
          if (i % 25 === 0) expect(JSON.parse(JSON.stringify(next))).toEqual(next);
          expect(next.eventSeq).toBeGreaterThanOrEqual(lastSeq);
          lastSeq = next.eventSeq;
          const seqs = next.events.map((e) => e.seq);
          expect([...seqs].sort((x, y) => x - y)).toEqual(seqs);
          expect(next.history.length).toBeLessThanOrEqual(HISTORY_LIMIT);
          for (const t of next.teams) {
            expect(t.bank).toBeGreaterThanOrEqual(0);
            expect(t.roundCash).toBeGreaterThanOrEqual(0);
            expect(Number.isFinite(t.bank)).toBe(true);
          }
          if (next.phase === 'awaiting-puzzles') expect(next.request).not.toBeNull();
          if (next.request === null) expect(next.phase).not.toBe('awaiting-puzzles');
          if (next.stage === 'round' && next.phase === 'choose') expect(next.turn).not.toBeNull();
          if (next.stage === 'bonus') reachedBonus += 1;
          if (next.stage === 'game-over') reachedOver += 1;
          // no hidden letter ever reaches the audience view
          const view = audienceView(next);
          for (const c of (view.board ?? []).flat())
            if (c.kind === 'tile' && !c.lit) expect(c.char).toBeNull();
          expect(JSON.stringify(view)).not.toContain('"phrase"');
          s = next;
        }
      }
    });
    expect(reachedBonus + reachedOver).toBeGreaterThan(0);
  });
});
