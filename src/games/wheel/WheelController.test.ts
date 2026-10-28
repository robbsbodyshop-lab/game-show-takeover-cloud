import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drawForIndex } from '@/engines/wheel/wheels';
import { isKind, toRound, wheelOf } from '@/engines/wheel/testKit';
import { makeHarness } from './controllerHarness';
import { FRENZY_TICK_MS, LATE_SOLVE_GRACE_MS, LIGHT_INTERVAL_MS, TOSSUP_REVEAL_MS } from './WheelController';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => {
  vi.useRealTimers();
});

/** Round 1 at the first choice point, Red (team 1) in control; the puzzle is RED APPLE PIE. */
const round1 = (extra: Parameters<typeof makeHarness>[0] = {}) => {
  const base = toRound(1);
  const { settings, ...rest } = extra;
  return makeHarness({ initialState: { ...base, settings: { ...base.settings, ...settings } }, ...rest });
};

/** The draw that lands the middle of the first cash wedge worth `value` in the current wheel. */
const drawFor = (h: ReturnType<typeof makeHarness>, value: number): number => {
  const i = wheelOf(h.engine()).findIndex((w) => w.kind === 'cash' && w.value === value && w.top !== true);
  return drawForIndex(i);
};

const spinAndWait = (h: ReturnType<typeof makeHarness>, draw: number): void => {
  h.queueDraws(draw);
  expect(h.controller.run('spin').applied).toBe(true);
  h.advance(9000);
};

describe('opening: the engine asks for puzzles and the controller answers', () => {
  it('starts a classic game with a toss-up in play and the category chime', () => {
    const h = makeHarness();
    const s = h.engine();
    expect(s.stage).toBe('tossup');
    expect(s.phase).toBe('tossup-reveal');
    expect(s.puzzle).not.toBeNull();
    expect(h.audio.played('wof_category_chime')).toBe(1);
    expect(h.host.last.kind).toBe('wheel');
    expect(h.used.flat()).toContain(s.puzzle?.puzzle.id);
  });

  it('never picks content the event already used', () => {
    const first = makeHarness({ seed: 3 });
    const id = first.engine().puzzle?.puzzle.id ?? '';
    const again = makeHarness({ seed: 3, usedContentIds: [id] });
    expect(again.engine().puzzle?.puzzle.id).not.toBe(id);
  });
});

describe('toss-up reveals', () => {
  it('lights a random tile every 900 ms under the toss-up bed and stops the bed on a buzz', () => {
    const h = makeHarness();
    expect(h.audio.loop).toHaveBeenCalledWith('wof_tossup_bed');
    expect(h.engine().puzzle?.shown.filter(Boolean)).toHaveLength(0);
    h.advance(TOSSUP_REVEAL_MS);
    expect(h.engine().puzzle?.shown.filter(Boolean)).toHaveLength(1);
    h.advance(TOSSUP_REVEAL_MS * 2);
    expect(h.engine().puzzle?.shown.filter(Boolean)).toHaveLength(3);
    expect(h.phones.press(1)).toBe(true);
    expect(h.engine().phase).toBe('tossup-answer');
    expect(h.audio.stopLoop).toHaveBeenCalledWith('wof_tossup_bed');
    expect(h.audio.played('wof_ring_in')).toBe(1);
    h.advance(5000);
    expect(h.engine().puzzle?.shown.filter(Boolean)).toHaveLength(3);
  });

  it('rejects a press before a letter shows', () => {
    const h = makeHarness();
    expect(h.phones.press(1)).toBe(false);
    expect(h.phones.lastAck).toMatchObject({ team: 1, accepted: false });
    expect(h.engine().phase).toBe('tossup-reveal');
    h.advance(TOSSUP_REVEAL_MS);
    expect(h.phones.press(2)).toBe(true);
    expect(h.engine().tossup?.buzzed).toBe(2);
  });

  it('a wrong answer locks the team out and the reveal resumes', () => {
    const h = makeHarness();
    h.advance(TOSSUP_REVEAL_MS);
    h.phones.press(1);
    expect(h.host.send('rule', { verdict: 'wrong' }, { teamId: 1 }).applied).toBe(true);
    expect(h.audio.played('wheel_buzzer')).toBe(1);
    expect(h.engine().teams[0]?.lockedOut).toBe(true);
    expect(h.phones.lastControls?.buzzTeams).toEqual([2, 3]);
    expect(h.phones.lastControls?.offLabel).toBe('Locked out of this puzzle');
    h.advance(TOSSUP_REVEAL_MS);
    expect(h.audio.loop).toHaveBeenCalledTimes(2);
    expect(h.phones.press(1)).toBe(false);
  });
});

describe('Fortune Frenzy', () => {
  it('runs the 30 s clock with its bed, pauses with the game and resumes with the time left', () => {
    const h = makeHarness({ settings: { opening: 'frenzy' } });
    expect(h.engine().stage).toBe('frenzy');
    h.advance(TOSSUP_REVEAL_MS);
    expect(h.engine().frenzy?.started).toBe(true);
    expect(h.audio.bed).toHaveBeenCalledWith('wof_frenzy_bed', { offsetSec: 0 });
    h.advance(10_000);
    const afterTen = h.engine().frenzy?.msLeft ?? 0;
    expect(afterTen).toBeGreaterThan(19_000);
    expect(afterTen).toBeLessThan(20_100);

    h.controller.setInputLocked(true);
    expect(h.audio.pauseAll).toHaveBeenCalledTimes(1);
    h.advance(60_000);
    expect(h.engine().frenzy?.msLeft).toBe(afterTen);

    h.controller.setInputLocked(false);
    expect(h.audio.resumeAll).toHaveBeenCalledTimes(1);
    h.advance(afterTen + FRENZY_TICK_MS);
    expect(h.engine().frenzy?.msLeft).toBe(0);
    expect(h.engine().phase).toBe('tossup-done');
    // The clock ending is a new moment: the console is told and older commands go stale.
    expect(h.host.data.phase).toBe('tossup-done');
    expect(h.audio.stop).toHaveBeenCalledWith('wof_frenzy_bed');
    expect(h.audio.played('wof_time_up')).toBeGreaterThanOrEqual(1);
  });

  it('restores a running clock with the bed offset to match', () => {
    const base = makeHarness({ settings: { opening: 'frenzy' } });
    base.advance(TOSSUP_REVEAL_MS + 18_000);
    const saved = base.engine();
    const msLeft = saved.frenzy?.msLeft ?? 0;
    const h = makeHarness({ initialState: saved });
    expect(h.audio.bed).toHaveBeenCalledWith('wof_frenzy_bed', { offsetSec: (30_000 - msLeft) / 1000 });
    h.advance(1000);
    expect(h.engine().frenzy?.msLeft).toBeLessThan(msLeft);
  });
});

describe('letters light one at a time', () => {
  it('lights each tile 450 ms apart with an overlapping ding and no turn clock until done', () => {
    const h = round1({ settings: { turnTimerSec: 5 } });
    spinAndWait(h, drawFor(h, 700));
    expect(h.engine().phase).toBe('call-consonant');
    expect(h.controller.run('letter', { letter: 'P' }).applied).toBe(true);
    const lit = () => h.engine().puzzle?.shown.filter(Boolean).length;
    expect(h.engine().puzzle?.queue).toHaveLength(3);
    expect(lit()).toBe(0);
    h.advance(LIGHT_INTERVAL_MS);
    expect(lit()).toBe(1);
    h.advance(LIGHT_INTERVAL_MS);
    expect(lit()).toBe(2);
    h.advance(LIGHT_INTERVAL_MS);
    expect(lit()).toBe(3);
    expect(h.audio.play.mock.calls.filter(([n]) => n === 'wof_letter_light')).toHaveLength(3);
    expect(h.audio.play).toHaveBeenCalledWith('wof_letter_light', { overlap: true });
    // The decision clock starts only now: 5 s later the turn passes.
    h.advance(4900);
    expect(h.engine().turn).toBe(1);
    h.advance(200);
    expect(h.engine().turn).toBe(2);
  });
});

describe('the spin holds its result until the wheel stops', () => {
  it('keeps the audience on the pre-spin state, ticks per peg and lands on the plan angle', () => {
    const h = round1();
    const draw = drawFor(h, 800);
    h.queueDraws(draw);
    h.controller.run('spin');
    const snap = h.controller.getSnapshot();
    expect(snap.spinning).toBe(true);
    expect(snap.view.spin).toBeNull();
    expect(h.engine().phase).toBe('call-consonant');
    expect(snap.legal).toEqual([]);
    expect(h.phones.lastControls?.offLabel).toBe('SPINNING');
    expect(h.controller.run('letter', { letter: 'P' })).toEqual({ applied: false, reason: 'spinning' });

    h.advance(3000);
    expect(h.audio.played('spin_tick')).toBeGreaterThan(10);
    expect(h.controller.getSnapshot().view.spin).toBeNull();
    h.advance(6000);
    const done = h.controller.getSnapshot();
    expect(done.spinning).toBe(false);
    expect(done.view.spin).toEqual({ kind: 'cash', value: 800 });
    expect(done.wheelDeg).toBeCloseTo((360 - draw * 360) % 360, 5);
  });

  it('holds Bankrupt: the money stays on the podium and the slide plays only after the stop', () => {
    const base = toRound(1);
    const rich = { ...base, teams: base.teams.map((t) => (t.id === 1 ? { ...t, roundCash: 1200 } : t)) };
    const h = makeHarness({ initialState: rich });
    const index = wheelOf(h.engine()).findIndex(isKind('bankrupt'));
    h.queueDraws(drawForIndex(index));
    h.controller.run('spin');
    expect(h.controller.getSnapshot().view.teams[0]?.roundCash).toBe(1200);
    expect(h.audio.played('wof_bankrupt')).toBe(0);
    h.advance(9000);
    const snap = h.controller.getSnapshot();
    expect(snap.view.teams[0]?.roundCash).toBe(0);
    expect(snap.view.turn).toBe(2);
    expect(snap.plate).toEqual({ kind: 'bankrupt', team: 1 });
    expect(h.audio.played('wof_bankrupt')).toBe(1);
    h.advance(3000);
    expect(h.controller.getSnapshot().plate).toBeNull();
  });

  it('pauses the spin with the game and resumes where it was', () => {
    const h = round1();
    h.queueDraws(drawForIndex(3));
    h.controller.run('spin');
    h.advance(2000);
    const frozen = h.controller.getSnapshot().wheelDeg;
    h.controller.setInputLocked(true);
    h.advance(30_000);
    expect(h.controller.getSnapshot().wheelDeg).toBe(frozen);
    expect(h.controller.getSnapshot().spinning).toBe(true);
    h.controller.setInputLocked(false);
    h.advance(9000);
    expect(h.controller.getSnapshot().spinning).toBe(false);
  });
});

describe('the turn timer', () => {
  it('times a team out after 5 s, then follows a live change to 10 s and to off', () => {
    const h = round1({ settings: { turnTimerSec: 5 } });
    expect(h.controller.getSnapshot().clock).toMatchObject({ kind: 'turn', totalMs: 5000 });
    h.advance(4900);
    expect(h.engine().turn).toBe(1);
    h.advance(200);
    expect(h.engine().turn).toBe(2);
    expect(h.audio.played('wheel_buzzer')).toBe(1);

    expect(h.host.send('set-turn-timer', { sec: 10 }).applied).toBe(true);
    expect(h.engine().settings.turnTimerSec).toBe(10);
    expect(h.saved.at(-1)?.turnTimerSec).toBe(10);
    h.advance(9900);
    expect(h.engine().turn).toBe(2);
    h.advance(200);
    expect(h.engine().turn).toBe(3);

    h.host.send('set-turn-timer', { sec: 0 });
    h.advance(60_000);
    expect(h.engine().turn).toBe(3);
    expect(h.controller.getSnapshot().clock).toBeNull();
  });

  it('pauses with the game and resumes with the time that was left', () => {
    const h = round1({ settings: { turnTimerSec: 10 } });
    h.advance(4000);
    h.controller.setInputLocked(true);
    expect(h.controller.getSnapshot().clock).toMatchObject({ running: false, remainingMs: 6000 });
    h.advance(120_000);
    expect(h.engine().turn).toBe(1);
    h.controller.setInputLocked(false);
    h.advance(5900);
    expect(h.engine().turn).toBe(1);
    h.advance(200);
    expect(h.engine().turn).toBe(2);
  });

  it('gives the solve back inside the 1.5 s late window and not after', () => {
    const h = round1({ settings: { turnTimerSec: 5 } });
    h.advance(5000);
    expect(h.engine().turn).toBe(2);
    h.advance(LATE_SOLVE_GRACE_MS - 500);
    expect(h.controller.getSnapshot().canLateSolve).toBe(true);
    expect(h.phones.action(1, 'solve-start')).toBe(true);
    expect(h.engine().phase).toBe('solving');
    expect(h.engine().solve?.team).toBe(1);
    expect(h.engine().turn).toBe(1);

    const late = round1({ settings: { turnTimerSec: 5 } });
    late.advance(5000 + LATE_SOLVE_GRACE_MS + 100);
    expect(late.phones.action(1, 'solve-start')).toBe(false);
    expect(late.engine().phase).toBe('choose');
  });
});

describe('the Speed-Up window', () => {
  it('gives 3 s to solve after a correct letter, then passes play', () => {
    const base = toRound(4);
    const h = makeHarness({ initialState: { ...base, bell: false } });
    h.host.send('ring-bell');
    expect(h.engine().stage).toBe('speedup');
    h.queueDraws(drawForIndex(1));
    h.controller.run('spin');
    h.advance(9000);
    expect(h.engine().phase).toBe('speedup-act');
    expect(h.controller.run('letter', { letter: 'R' }).applied).toBe(true);
    expect(h.engine().phase).toBe('speedup-window');
    // The 3 s start once the tile has lit (450 ms).
    h.advance(LIGHT_INTERVAL_MS + 2900);
    expect(h.engine().turn).toBe(1);
    h.advance(200);
    expect(h.engine().turn).toBe(2);
    expect(h.audio.played('wheel_buzzer')).toBe(1);
  });
});
