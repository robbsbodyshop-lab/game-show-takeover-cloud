import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { autoplay, newGame, run, toRound, wheelOf } from '@/engines/wheel/testKit';
import { drawForIndex } from '@/engines/wheel/wheels';
import type { WheelState } from '@/engines/wheel/types';
import { readWheelHostData } from './hostData';
import { makeHarness } from './controllerHarness';
import type { Harness } from './controllerHarness';
import { HOST_REPEAT_MS } from './WheelController';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(2_000_000);
});
afterEach(() => {
  vi.useRealTimers();
});

const round1 = (
  patch: (s: WheelState) => WheelState = (s) => s,
  extra: Parameters<typeof makeHarness>[0] = {},
) => makeHarness({ initialState: patch(toRound(1)), ...extra });

const cashDraw = (h: Harness, value: number): number =>
  drawForIndex(
    wheelOf(h.engine()).findIndex((w) => w.kind === 'cash' && w.value === value && w.top !== true),
  );

const kindDraw = (h: Harness, kind: string): number =>
  drawForIndex(wheelOf(h.engine()).findIndex((w) => w.kind === kind));

function spin(h: Harness, draw: number): void {
  h.queueDraws(draw);
  h.controller.run('spin');
  h.advance(9000);
}

describe('delayed cues', () => {
  const claimWildCard = (): Harness => {
    const h = round1();
    spin(h, kindDraw(h, 'wild-card'));
    h.controller.run('letter', { letter: 'P' });
    expect(h.engine().teams[0]?.wildCard).toBe(true);
    return h;
  };

  it('plays the Wild Card sting after its delay', () => {
    const h = claimWildCard();
    expect(h.audio.played('wof_wild_card')).toBe(0);
    h.advance(600);
    expect(h.audio.played('wof_wild_card')).toBe(1);
  });

  it('drops a cue still waiting when the host undoes the ruling', () => {
    const h = claimWildCard();
    h.advance(100);
    expect(h.host.send('undo').applied).toBe(true);
    expect(h.engine().teams[0]?.wildCard).toBe(false);
    h.advance(5000);
    expect(h.audio.played('wof_wild_card')).toBe(0);
    // And undoing never replays what already sounded.
    const before = h.audio.play.mock.calls.length;
    h.advance(5000);
    expect(h.audio.play.mock.calls.length).toBe(before);
  });

  it('drops a waiting cue when the puzzle is thrown out', () => {
    const h = claimWildCard();
    expect(h.host.send('throw-out').applied).toBe(true);
    h.advance(5000);
    expect(h.audio.played('wof_wild_card')).toBe(0);
  });
});

describe('the phone podium', () => {
  it('publishes the engine controls and answers presses and actions for the team at the wheel only', () => {
    const h = round1();
    expect(h.phones.lastControls).toMatchObject({
      activeTeam: 1,
      canSpin: true,
      canSolve: true,
      canBuy: false,
      turnName: 'Red',
    });

    expect(h.phones.action(2, 'spin')).toBe(false);
    expect(h.engine().phase).toBe('choose');
    h.queueDraws(cashDraw(h, 700));
    expect(h.phones.action(1, 'spin')).toBe(true);
    expect(h.phones.lastControls?.offLabel).toBe('SPINNING');
    h.advance(9000);
    expect(h.phones.lastControls).toMatchObject({ canSpin: false, canSolve: true });
  });

  it('BUY opens the vowel pick on the stage for that team, or buys the letter it carries', () => {
    const h = round1((s) => ({
      ...s,
      teams: s.teams.map((t) => (t.id === 1 ? { ...t, roundCash: 1000 } : t)),
    }));
    expect(h.phones.lastControls?.canBuy).toBe(true);
    expect(h.phones.action(2, 'buy')).toBe(false);
    expect(h.phones.action(1, 'buy')).toBe(true);
    expect(h.controller.getSnapshot().vowelPickTeam).toBe(1);
    expect(h.controller.run('buy-vowel', { letter: 'E' }).applied).toBe(true);
    expect(h.controller.getSnapshot().vowelPickTeam).toBeNull();
    expect(h.engine().teams[0]?.roundCash).toBe(750);
    expect(h.audio.played('vowel')).toBe(1);
    expect(h.phones.action(1, 'buy', 'A')).toBe(true);
    expect(h.engine().teams[0]?.roundCash).toBe(500);
  });

  it('solve-start stops the clock, solve judges the answer, solve-cancel gives the turn back', () => {
    const h = round1();
    expect(h.phones.action(1, 'solve-start')).toBe(true);
    expect(h.engine().phase).toBe('solving');
    expect(h.phones.lastControls?.offLabel).toBe('SOLVING');
    expect(h.phones.action(1, 'solve-cancel')).toBe(true);
    expect(h.engine().phase).toBe('choose');

    h.advance(HOST_REPEAT_MS + 10);
    h.phones.action(1, 'solve-start');
    expect(h.phones.action(1, 'solve', 'red apple pie')).toBe(true);
    expect(h.engine().phase).toBe('round-award');
    expect(h.engine().teams[0]?.bank).toBe(4000);
    expect(h.audio.played('wof_solve')).toBe(1);
  });

  it('a wrong answer passes the turn; a close one waits for the host and is never on the stage', () => {
    const wrong = round1();
    wrong.phones.action(1, 'solve-start');
    expect(wrong.phones.action(1, 'solve', 'blue moon rising')).toBe(true);
    expect(wrong.engine().turn).toBe(2);
    expect(wrong.audio.played('wheel_buzzer')).toBe(1);

    const close = round1();
    close.phones.action(1, 'solve-start');
    expect(close.phones.action(1, 'solve', 'red apple pies')).toBe(true);
    expect(close.engine().phase).toBe('solving');
    const snap = close.controller.getSnapshot();
    expect(snap.judging).toEqual({ team: 1, source: 'phone' });
    expect(JSON.stringify(snap)).not.toMatch(/PIES/i);
    const host = readWheelHostData(close.host.last.data);
    expect(host.pending).toEqual({ team: 1, answer: 'red apple pies', source: 'phone' });

    expect(close.host.send('accept-pending', undefined, { teamId: 1 }).applied).toBe(true);
    expect(close.engine().phase).toBe('round-award');
    expect(close.controller.getSnapshot().judging).toBeNull();
  });

  it('a close answer the host rejects is a wrong solve', () => {
    const h = round1();
    h.phones.action(1, 'solve-start');
    h.phones.action(1, 'solve', 'red apple pies');
    h.host.send('reject-pending', undefined, { teamId: 1 });
    expect(h.engine().turn).toBe(2);
    expect(h.engine().phase).toBe('choose');
  });
});

describe('host commands', () => {
  it('drops a command stamped with an older revision, except Undo', () => {
    const h = round1();
    const rev = h.host.last.gameRev;
    h.queueDraws(cashDraw(h, 700));
    h.controller.run('spin');
    h.advance(9000);
    expect(h.host.last.gameRev).toBeGreaterThan(rev);
    expect(h.host.send('letter', { letter: 'P' }, { gameRev: rev })).toEqual({
      applied: false,
      reason: 'stale',
    });
    expect(h.engine().phase).toBe('call-consonant');
    expect(h.host.send('undo', undefined, { gameRev: rev }).applied).toBe(true);
    expect(h.engine().phase).toBe('choose');
  });

  it('counts the same command twice within 500 ms once, and again after the window', () => {
    const h = round1();
    expect(h.host.send('adjust-bank', { team: 1, delta: 500 }).applied).toBe(true);
    expect(h.host.send('adjust-bank', { team: 1, delta: 500 }).applied).toBe(false);
    expect(h.engine().teams[0]?.bank).toBe(3500);
    h.advance(HOST_REPEAT_MS + 1);
    expect(h.host.send('adjust-bank', { team: 1, delta: 500 }).applied).toBe(true);
    expect(h.engine().teams[0]?.bank).toBe(4000);
  });

  it('refuses a command stamped for the wrong team', () => {
    const h = round1();
    expect(h.host.send('spin', undefined, { teamId: 2 })).toEqual({ applied: false, reason: 'wrong-team' });
    expect(h.engine().phase).toBe('choose');
    h.queueDraws(cashDraw(h, 600));
    expect(h.host.send('spin', undefined, { teamId: 1 }).applied).toBe(true);
  });

  it('answers a repeated command id with the first result and does not apply it twice', () => {
    const h = round1();
    const first = h.host.send('adjust-bank', { team: 2, delta: 100 }, { cmdId: 'same' });
    expect(first.applied).toBe(true);
    h.advance(HOST_REPEAT_MS + 100);
    // Same id again (the second path, or a retry): the first answer comes back, nothing is applied twice.
    expect(h.host.send('adjust-bank', { team: 2, delta: 100 }, { cmdId: 'same' })).toEqual(first);
    expect(h.engine().teams[1]?.bank).toBe(100);
  });

  it('ignores host commands while locked unless the stage lets them through', () => {
    const h = round1();
    h.controller.setInputLocked(true);
    expect(h.host.send('adjust-bank', { team: 1, delta: 100 })).toEqual({ applied: false, reason: 'locked' });
    expect(h.phones.action(1, 'solve-start')).toBe(false);
    expect(h.controller.run('spin').applied).toBe(false);
    const open = round1((s) => s, { allowHostWhileLocked: true, inputLocked: true });
    expect(open.host.send('adjust-bank', { team: 1, delta: 100 }).applied).toBe(true);
  });

  it('runs every console tool on a round: skip, set turn, throw out (next puzzle stays), end unsolved', () => {
    const h = round1();
    expect(h.host.data.nextPuzzle).toMatchObject({ phrase: 'SPARE PUZZLE' });
    expect(h.host.send('skip-turn', undefined, { teamId: 1 }).applied).toBe(true);
    expect(h.engine().turn).toBe(2);
    h.advance(HOST_REPEAT_MS + 1);
    expect(h.host.send('set-turn', { team: 3 }).applied).toBe(true);
    expect(h.engine().turn).toBe(3);
    h.advance(HOST_REPEAT_MS + 1);
    expect(h.host.send('throw-out').applied).toBe(true);
    expect(h.engine().puzzle?.puzzle.phrase).toBe('SPARE PUZZLE');
    expect(h.engine().turn).toBe(3);
    h.advance(HOST_REPEAT_MS + 1);
    expect(h.host.send('end-unsolved').applied).toBe(true);
    expect(h.engine().phase).toBe('round-award');
    expect(h.host.send('continue').applied).toBe(true);
    expect(h.engine().round).toBe(2);
  });
});

describe('the host snapshot', () => {
  it('carries the puzzle, legal actions, next puzzle, clocks and phone status for the console only', () => {
    const h = round1();
    const data = h.host.data;
    expect(h.host.last.kind).toBe('wheel');
    expect(data.puzzle).toMatchObject({ phrase: 'RED APPLE PIE', category: 'THING' });
    expect(data.legal).toEqual(expect.arrayContaining(['SPIN', 'SOLVE_START']));
    expect(data.phone).toMatchObject({ activeTeam: 1, canSpin: true });
    expect(data.acting).toBe(1);
    expect(data.teams).toHaveLength(3);
    expect(data.headline).toContain('Red');
    // The audience-facing UI snapshot has none of it.
    const text = JSON.stringify(h.controller.getSnapshot());
    expect(text).not.toContain('RED APPLE PIE');
    expect(text).not.toContain('SPARE PUZZLE');
  });

  it('publishes again when the revision moves and on a lock', () => {
    const h = round1();
    const n = h.host.snapshots.length;
    h.host.send('ring-bell');
    expect(h.host.snapshots.length).toBeGreaterThan(n);
    h.controller.setInputLocked(true);
    expect(h.host.last.inputLocked).toBe(true);
  });
});

describe('restoring a saved game', () => {
  it('shows the saved state at once without replaying a single cue', () => {
    const live = round1();
    live.queueDraws(cashDraw(live, 700));
    live.controller.run('spin');
    live.advance(9000);
    live.controller.run('letter', { letter: 'P' });
    live.advance(2000);
    const saved = live.engine();

    const h = makeHarness({ initialState: JSON.parse(JSON.stringify(saved)) as unknown });
    expect(h.audio.play).not.toHaveBeenCalled();
    expect(h.controller.getSnapshot().view.called).toEqual(['P']);
    expect(h.phones.lastControls).toMatchObject({ activeTeam: 1 });
    expect(h.host.data.puzzle?.phrase).toBe('RED APPLE PIE');
    expect(h.used).toEqual([]);
  });

  it('ignores a state that is not a Wheel save', () => {
    const h = makeHarness({ initialState: { hello: 'world' } });
    expect(h.engine().stage).toBe('tossup');
  });
});

describe('the end of the game', () => {
  const finished = (): WheelState => {
    const s = autoplay(newGame({ length: 'short', bonusRound: false }), (st) => st.stage === 'game-over');
    return s.stage === 'game-over' ? s : run(s, { type: 'CONTINUE' });
  };

  it('reports once, from the game result, when the host continues from the winner card', () => {
    const s = finished();
    expect(s.stage).toBe('game-over');
    const h = makeHarness({ initialState: s });
    expect(h.ended).toEqual([]);
    expect(h.controller.getSnapshot().result?.winnerId).toBe(s.outcome?.winnerId);
    expect(h.controller.run('continue').applied).toBe(true);
    h.advance(HOST_REPEAT_MS + 1);
    h.controller.run('continue');
    h.host.send('continue');
    expect(h.ended).toHaveLength(1);
    expect(h.ended[0]).toMatchObject({ winnerId: s.outcome?.winnerId, bonusChips: 0 });
    expect(h.ended[0]?.roundScore).toBeGreaterThan(0);
    expect(h.audio.stopAll).toHaveBeenCalled();
  });

  it('credits every other team its points', () => {
    const s = finished();
    const h = makeHarness({ initialState: s });
    h.controller.run('continue');
    const report = h.ended[0];
    const others = s.teams.filter((t) => t.id !== s.outcome?.winnerId);
    expect(report?.extraScores).toEqual(
      others.map((t) => ({ team: t.id, points: Math.round(t.bank / 100) })),
    );
  });

  it('plays the game-over fanfare after a short delay when the game ends', () => {
    let s = autoplay(
      newGame({ length: 'short', bonusRound: false }),
      (st) => st.phase === 'round-award' && st.award?.speedUp === true,
    );
    s = run(s, { type: 'ADJUST_BANK', team: 1, delta: 5000 });
    const h = makeHarness({ initialState: s });
    h.controller.run('continue');
    expect(h.engine().stage).toBe('game-over');
    h.advance(700);
    expect(h.audio.played('winner_fanfare')).toBe(0);
    h.advance(200);
    expect(h.audio.played('winner_fanfare')).toBe(1);
  });
});

describe('a host override takes back a waiting cue', () => {
  it('Prize Puzzle applause is dropped when the host reverses the ruling in time', () => {
    const h = makeHarness({ initialState: toRound(3) });
    const team = h.engine().turn ?? 0;
    h.phones.action(team, 'solve-start');
    h.phones.action(team, 'solve', h.engine().puzzle?.puzzle.phrase ?? '');
    expect(h.engine().phase).toBe('round-award');
    expect(h.audio.played('wof_solve')).toBe(1);
    h.advance(100);
    expect(h.host.send('rule', { verdict: 'wrong' }, { teamId: team }).applied).toBe(true);
    h.advance(5000);
    expect(h.audio.played('applause')).toBe(0);
  });

  it('plays the applause when nobody overrides', () => {
    const h = makeHarness({ initialState: toRound(3) });
    const team = h.engine().turn ?? 0;
    h.phones.action(team, 'solve-start');
    h.phones.action(team, 'solve', h.engine().puzzle?.puzzle.phrase ?? '');
    h.advance(1000);
    expect(h.audio.played('applause')).toBe(1);
  });
});
