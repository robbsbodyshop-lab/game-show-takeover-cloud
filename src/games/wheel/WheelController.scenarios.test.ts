import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { autoplay, newGame, toRound, wheelOf } from '@/engines/wheel/testKit';
import { drawForIndex } from '@/engines/wheel/wheels';
import type { WheelState } from '@/engines/wheel/types';
import { makeHarness } from './controllerHarness';
import type { Harness } from './controllerHarness';
import { BANKRUPT_AFTER_BUZZER_MS, BANKRUPT_AFTER_ROLL_MS } from './cues';
import { HOST_REPEAT_MS, TOSSUP_REVEAL_MS } from './WheelController';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(7_000_000);
});
afterEach(() => {
  vi.useRealTimers();
});

const kindDraw = (h: Harness, kind: string): number =>
  drawForIndex(wheelOf(h.engine()).findIndex((w) => w.kind === kind));

/** Waits for a letter to show, rings in for `team` and rules the answer. */
function answerTossup(h: Harness, team: number, verdict: 'correct' | 'wrong'): void {
  h.advance(TOSSUP_REVEAL_MS);
  expect(h.phones.press(team)).toBe(true);
  expect(h.host.send('rule', { verdict }, { teamId: team }).applied).toBe(true);
  h.advance(HOST_REPEAT_MS + 50);
}

describe('Fortune Frenzy end to end', () => {
  it('deals the next puzzle from the same category after every answer, right or wrong, to the last second', () => {
    const h = makeHarness({ settings: { opening: 'frenzy' }, seed: 5 });
    const category = h.engine().puzzle?.puzzle.category;
    const seen = new Set<string>();
    let solved = 0;
    for (let i = 0; i < 14 && h.engine().phase !== 'tossup-done'; i++) {
      seen.add(h.engine().puzzle?.puzzle.id ?? '');
      expect(h.engine().puzzle?.puzzle.category).toBe(category);
      answerTossup(h, 1 + (i % 2), i % 3 === 2 ? 'wrong' : 'correct');
      if (i % 3 !== 2) solved += 1;
    }
    expect(solved).toBeGreaterThanOrEqual(9);
    expect(h.engine().frenzy?.solved).toBe(solved);
    expect(seen.size).toBeGreaterThanOrEqual(10);
    expect(h.audio.played('wof_triple_ding')).toBe(solved);
    // The clock is still the one running the show: 14 x ~1.5 s is under the 30 s.
    expect(h.engine().frenzy?.msLeft).toBeLessThan(30_000);
  });

  it('ends on the clock, reveals the last puzzle and names the last solver the starter', () => {
    const h = makeHarness({ settings: { opening: 'frenzy' }, seed: 9 });
    answerTossup(h, 2, 'correct');
    h.advance(31_000);
    expect(h.engine().phase).toBe('tossup-done');
    expect(h.engine().tossup?.solver).toBe(2);
    expect(h.controller.getSnapshot().continueLabel).toBe('On to Round 1');
    expect(h.host.send('continue').applied).toBe(true);
    expect(h.engine().turn).toBe(2);
  });
});

describe('Triple Toss-Up', () => {
  it('plays three puzzles of one set, applauds the sweep and starts Round 4 with the third solver', () => {
    const asking = autoplay(newGame({}), (s) => s.stage === 'triple' && s.phase === 'awaiting-puzzles');
    const h = makeHarness({ initialState: asking, seed: 2 });
    expect(h.engine().stage).toBe('triple');
    const set = new Set<string | undefined>();
    for (let i = 0; i < 3; i++) {
      set.add(h.engine().puzzle?.puzzle.set);
      answerTossup(h, 3, 'correct');
      expect(h.controller.getSnapshot().continueLabel).not.toBeNull();
      if (i < 2) {
        expect(h.controller.getSnapshot().continueLabel).toBe('Next puzzle');
        h.host.send('continue');
        h.advance(HOST_REPEAT_MS + 50);
      }
    }
    expect(set.size).toBe(1);
    expect(h.audio.played('wof_triple_ding')).toBe(2);
    expect(h.audio.played('wof_tossup_solve')).toBe(1);
    expect(h.engine().teams.find((t) => t.id === 3)?.bank).toBeGreaterThanOrEqual(6000 + 4000);
    h.advance(1000);
    expect(h.audio.played('applause')).toBe(1);
    h.host.send('continue');
    expect(h.engine().round).toBe(4);
    expect(h.engine().turn).toBe(3);
  });
});

describe('the Express', () => {
  it('rides with its bed and a miss buzzes, then slides to Bankrupt after the buzzer', () => {
    const h = makeHarness({ initialState: toRound(3) });
    const team = h.engine().turn ?? 0;
    h.queueDraws(kindDraw(h, 'express'));
    h.controller.run('spin');
    h.advance(9000);
    expect(h.audio.played('wof_express')).toBe(1);
    expect(h.controller.run('letter', { letter: 'P' }).applied).toBe(true);
    h.advance(1500);
    expect(h.engine().phase).toBe('express-choice');
    expect(h.controller.getSnapshot().view.phase).toBe('express-choice');
    expect(h.host.send('express', { choice: 'play' }, { teamId: team }).applied).toBe(true);
    expect(h.audio.loop).toHaveBeenCalledWith('wof_express_bed');

    h.advance(HOST_REPEAT_MS + 50);
    expect(h.controller.run('letter', { letter: 'Z' }).applied).toBe(true);
    expect(h.audio.stopLoop).toHaveBeenCalledWith('wof_express_bed');
    expect(h.audio.played('wheel_buzzer')).toBe(1);
    expect(h.audio.played('wof_bankrupt')).toBe(0);
    h.advance(BANKRUPT_AFTER_BUZZER_MS + 50);
    expect(h.audio.played('wof_bankrupt')).toBe(1);
    expect(h.controller.getSnapshot().plate).toEqual({ kind: 'bankrupt', team });
    expect(h.engine().turn).not.toBe(team);
  });
});

describe('the Mystery wedge', () => {
  const mysteryState = (): WheelState => {
    const base = toRound(2);
    return {
      ...base,
      phase: 'mystery-choice',
      spin: { index: 5, kind: 'mystery', value: 1000, third: null, wildCardCall: false, earned: 2000 },
      teams: base.teams.map((t) => (t.id === base.turn ? { ...t, roundCash: 2000 } : t)),
    };
  };

  it('flipping to Bankrupt rolls first, then slides, and shows its plate after the roll', () => {
    const h = makeHarness({ initialState: mysteryState(), draws: [0.9] });
    const team = h.engine().turn ?? 0;
    expect(h.host.send('mystery', { choice: 'flip' }, { teamId: team }).applied).toBe(true);
    expect(h.audio.played('wof_mystery_flip')).toBe(1);
    h.advance(BANKRUPT_AFTER_ROLL_MS - 100);
    expect(h.audio.played('wof_bankrupt')).toBe(0);
    expect(h.controller.getSnapshot().plate).toBeNull();
    h.advance(200);
    expect(h.audio.played('wof_bankrupt')).toBe(1);
    expect(h.controller.getSnapshot().plate?.kind).toBe('bankrupt');
  });

  it('flipping to $10,000 rolls then applauds', () => {
    const h = makeHarness({ initialState: mysteryState(), draws: [0.1] });
    h.host.send('mystery', { choice: 'flip' });
    h.advance(BANKRUPT_AFTER_ROLL_MS + 100);
    expect(h.audio.played('applause')).toBe(1);
    expect(h.controller.getSnapshot().plate?.kind).toBe('mystery-win');
  });

  it('keeping the money returns to the turn', () => {
    const h = makeHarness({ initialState: mysteryState() });
    expect(h.host.send('mystery', { choice: 'keep' }).applied).toBe(true);
    expect(h.engine().phase).toBe('choose');
  });
});

describe('the Speed-Up spin', () => {
  it('shows a non-cash result, then lets the team spin again until it lands on cash', () => {
    const h = makeHarness({ initialState: toRound(4) });
    h.host.send('ring-bell');
    expect(h.engine().phase).toBe('speedup-spin');
    h.queueDraws(kindDraw(h, 'bankrupt'));
    h.controller.run('spin');
    h.advance(9000);
    expect(h.engine().phase).toBe('speedup-spin');
    expect(h.controller.getSnapshot().view.speedUp?.value).toBeNull();
    h.queueDraws(drawForIndex(1));
    h.controller.run('spin');
    h.advance(9000);
    expect(h.engine().phase).toBe('speedup-act');
    expect(h.controller.getSnapshot().view.speedUp?.value).toBeGreaterThan(1000);
    expect(h.audio.played('wof_final_spin')).toBeGreaterThanOrEqual(1);
  });
});
