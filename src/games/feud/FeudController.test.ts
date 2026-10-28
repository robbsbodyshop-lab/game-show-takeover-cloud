import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FM_P1_MS } from '@/engines/feud/fastMoney';
import { afterFourRounds } from '@/engines/feud/testFixtures';
import { feudReducer } from '@/engines/feud/feudEngine';
import type { FeudController } from './FeudController';
import {
  COLORS,
  COMMS,
  CONTENT,
  FOOD,
  SUDDEN,
  makeHarness,
  type Harness,
  type HarnessOptions,
} from './testKit';
import { FEUD_TIMING } from './timing';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

const quick: HarnessOptions['settings'] = { answerTimerSec: 0, format: 'one-round' };

const engine = (h: Harness) => h.controller.getEngineState();
const answerLeft = (h: Harness): number | undefined =>
  h.controller.getSavedState().clocks.answer?.remainingMs;
const tick = (ms: number): void => {
  vi.advanceTimersByTime(ms);
};

/** Judges a slot as the host and lets the "survey says" beat finish. */
const rule = (h: Harness, slot: number): void => {
  const outcome = h.host.send('judge-slot', { slot });
  expect(outcome).toEqual({ applied: true });
  tick(FEUD_TIMING.surveySaysMs);
};

/** Round 1 up to the first answer: family A (team 1) buzzed first. */
const toFirstAnswer = (h: Harness): void => {
  h.controller.run('advance'); // game starts, round 1 loads
  h.controller.run('advance'); // buzzers open
  h.phones.press(1, 'p-first');
};

/** Family A wins the face-off with the top answer and plays. */
const toControl = (h: Harness): void => {
  toFirstAnswer(h);
  rule(h, 0);
  expect(h.host.send('play')).toEqual({ applied: true });
};

const strikes = (h: Harness, count: number): void => {
  for (let i = 0; i < count; i += 1) {
    expect(h.host.send('strike').applied).toBe(true);
    tick(FEUD_TIMING.repeatDropMs + 100);
  }
};

/** A whole one-round game to the won screen. */
const toGameWon = (h: Harness): void => {
  toControl(h);
  for (const slot of [1, 2, 3, 4]) rule(h, slot);
  expect(engine(h).phase).toBe('round-summary');
  h.controller.run('advance');
  expect(engine(h).phase).toBe('game-won');
};

const fmType = (h: Harness, slot: number): void => {
  const fm = engine(h).fastMoney;
  const question = fm?.queue[0];
  if (fm === null || question === undefined) throw new Error('no Fast Money question on screen');
  const text = fm.questions[question]?.answers[slot]?.answer ?? '';
  expect(h.host.send('submit-text', { text }).applied).toBe(true);
  tick(FEUD_TIMING.repeatDropMs + 100);
};

describe('FeudController: beats and flow', () => {
  it('starts round 1 from Enter, plays the round sting once and opens the buzzers on the next Enter', () => {
    const h = makeHarness({ settings: quick });
    expect(engine(h).phase).toBe('pre-game');
    expect(h.controller.run('advance')).toEqual({ applied: true });
    expect(engine(h).phase).toBe('face-off');
    expect(engine(h).faceOff?.stage).toBe('ready');
    expect(h.audio.played('ff_round_sting')).toBe(1);
    h.controller.run('advance');
    expect(engine(h).faceOff?.stage).toBe('buzzers-open');
    expect(h.onContentUsed).toHaveBeenCalledTimes(1);
  });

  it('runs a typed answer through "Survey says" before the board changes', () => {
    const h = makeHarness({ settings: quick });
    toFirstAnswer(h);
    expect(h.host.send('submit-text', { text: 'pizza' })).toEqual({ applied: true });
    expect(h.speak).toHaveBeenCalledWith('Survey says');
    expect(engine(h).board[0]?.revealed).toBe(false);
    expect(h.controller.getSnapshot().surveySays).toBe(true);

    tick(FEUD_TIMING.surveySaysMs - 1);
    expect(engine(h).board[0]?.revealed).toBe(false);
    tick(1);
    expect(engine(h).board[0]?.revealed).toBe(true);
    expect(engine(h).phase).toBe('play-or-pass');
    expect(h.audio.played('ff_reveal')).toBe(1);
    expect(h.audio.played('ff_crowd_cheer')).toBe(0);
    tick(FEUD_TIMING.cheerDelayMs);
    expect(h.audio.played('ff_crowd_cheer')).toBe(1);
    expect(h.controller.getSnapshot().surveySays).toBe(false);
  });

  it('shows the flip at once when the host skips the beat with Enter', () => {
    const h = makeHarness({ settings: quick });
    toFirstAnswer(h);
    h.host.send('submit-text', { text: 'pizza' });
    h.controller.run('advance');
    expect(engine(h).board[0]?.revealed).toBe(true);
    tick(FEUD_TIMING.surveySaysMs * 2);
    expect(engine(h).board[0]?.points).toBe(40);
  });

  it('treats a typed miss as a face-off X after the beat, and "pass" typed as a miss without a beat', () => {
    const h = makeHarness({ settings: quick });
    toFirstAnswer(h);
    h.host.send('submit-text', { text: 'banana' });
    tick(FEUD_TIMING.surveySaysMs);
    expect(engine(h).faceOff?.stage).toBe('second-answer');
    expect(h.audio.played('ff_strike')).toBe(1);
    tick(FEUD_TIMING.awwDelayMs);
    expect(h.audio.played('ff_crowd_aww')).toBe(1);
    h.host.send('submit-text', { text: 'pass' });
    expect(engine(h).faceOff?.stage).toBe('first-answer');
    expect(engine(h).faceOff?.pair).toBe(1);
  });

  it('lets Undo take back a ruling still in its beat without touching the engine', () => {
    const h = makeHarness({ settings: quick });
    toFirstAnswer(h);
    const before = engine(h);
    h.host.send('submit-text', { text: 'pizza' });
    expect(h.host.send('undo')).toEqual({ applied: true });
    tick(FEUD_TIMING.surveySaysMs * 2);
    expect(engine(h)).toBe(before);
  });

  it('plays a game to the end and reports it exactly once on Continue', () => {
    const h = makeHarness({ settings: quick });
    toGameWon(h);
    expect(h.audio.played('ff_game_win')).toBe(1);
    expect(h.host.send('skip-fm')).toEqual({ applied: true });
    expect(engine(h).phase).toBe('game-over');
    expect(h.onGameEnd).not.toHaveBeenCalled();

    expect(h.host.send('continue').applied).toBe(true);
    expect(h.host.send('continue').applied).toBe(false);
    h.controller.run('advance');
    expect(h.onGameEnd).toHaveBeenCalledTimes(1);
    expect(h.onGameEnd).toHaveBeenCalledWith({
      winnerId: 1,
      roundScore: 95,
      extraScores: [{ team: 2, points: 0 }],
      bonusChips: 0,
    });
  });

  it('marks the survey used once and never reuses it', () => {
    const h = makeHarness({
      settings: quick,
      content: { surveys: [FOOD, COLORS], fastMoney: CONTENT.fastMoney },
    });
    h.controller.run('advance');
    const first = engine(h).survey?.id;
    expect(h.onContentUsed).toHaveBeenCalledWith([first]);
    h.controller.run('replace-survey');
    const second = engine(h).survey?.id;
    expect(second).not.toBe(first);
    expect(h.onContentUsed).toHaveBeenLastCalledWith([second]);
  });
});

describe('FeudController: clocks', () => {
  it('runs the host-only answer timer, ticks at one second left and strikes on time-out', () => {
    const h = makeHarness({ settings: { format: 'one-round', answerTimerSec: 5 } });
    toControl(h);
    expect(h.host.data.clocks.answer?.remainingMs).toBe(5000);
    tick(3999);
    expect(h.audio.played('ff_time_warn')).toBe(0);
    tick(1);
    expect(h.audio.played('ff_time_warn')).toBe(1);
    tick(999);
    expect(engine(h).strikes).toBe(0);
    tick(1);
    expect(engine(h).strikes).toBe(1);
    expect(engine(h).events.some((e) => e.type === 'STRIKE' && e.cause === 'timeout')).toBe(true);
  });

  it('holds the answer timer after a ruling, then restarts it for the next player', () => {
    const h = makeHarness({ settings: { format: 'one-round', answerTimerSec: 5 } });
    toControl(h);
    tick(5000); // time out: strike 1
    expect(engine(h).strikes).toBe(1);
    const clock = h.host.data.clocks.answer;
    expect(clock?.leadMs).toBe(FEUD_TIMING.rulingHoldMs);
    expect(clock?.remainingMs).toBe(5000);
    tick(FEUD_TIMING.rulingHoldMs + 4000);
    expect(answerLeft(h)).toBe(1000);
  });

  it('keeps the remaining time across a pause and resumes from it', () => {
    const h = makeHarness({ settings: { format: 'one-round', answerTimerSec: 5 } });
    toControl(h);
    tick(2000);
    h.controller.setInputLocked(true);
    tick(60_000);
    expect(engine(h).strikes).toBe(0);
    expect(h.audio.calls.some((c) => c.kind === 'pauseAll')).toBe(true);
    h.controller.setInputLocked(false);
    expect(h.audio.calls.some((c) => c.kind === 'resumeAll')).toBe(true);
    tick(2999);
    expect(engine(h).strikes).toBe(0);
    tick(1);
    expect(engine(h).strikes).toBe(1);
  });

  it('holds the answer timer while the host types', () => {
    const h = makeHarness({ settings: { format: 'one-round', answerTimerSec: 5 } });
    toControl(h);
    tick(1000);
    h.host.send('hold-answer');
    expect(h.host.data.clocks.answer?.running).toBe(false);
    tick(FEUD_TIMING.typingHoldMs - 1);
    expect(answerLeft(h)).toBe(4000);
    tick(1);
    expect(h.host.data.clocks.answer?.running).toBe(true);
    tick(3999);
    expect(engine(h).strikes).toBe(0);
    tick(1);
    expect(engine(h).strikes).toBe(1);
  });

  it('calls the captain when the steal huddle timer ends, and stays open when it is untimed', () => {
    const timed = makeHarness({ settings: { format: 'one-round', answerTimerSec: 0, stealTimerSec: 15 } });
    toControl(timed);
    strikes(timed, 3);
    expect(engine(timed).phase).toBe('steal-confer');
    const left = timed.controller.getSavedState().clocks.steal?.remainingMs ?? 0;
    expect(left).toBeGreaterThan(14_000);
    tick(left - 1);
    expect(engine(timed).phase).toBe('steal-confer');
    tick(1);
    expect(engine(timed).phase).toBe('steal-answer');

    const open = makeHarness({ settings: { format: 'one-round', answerTimerSec: 0, stealTimerSec: 0 } });
    toControl(open);
    strikes(open, 3);
    tick(600_000);
    expect(engine(open).phase).toBe('steal-confer');
    expect(open.host.data.clocks.steal).toBeNull();
  });
});

describe('FeudController: Fast Money', () => {
  const toFastMoney = (h: Harness): void => {
    toGameWon(h);
    expect(h.controller.run('advance')).toEqual({ applied: true });
    expect(engine(h).phase).toBe('fast-money');
    expect(engine(h).fastMoney?.phase).toBe('p1-ready');
  };

  it('deals five questions, ticks the clock with real elapsed time and pauses with the lock', () => {
    const h = makeHarness({ settings: quick });
    toFastMoney(h);
    expect(h.audio.played('ff_round_sting')).toBe(2);
    h.controller.run('advance'); // start the clock
    expect(h.audio.beds('ff_fm_clock_20')).toHaveLength(1);
    expect(h.audio.beds('ff_fm_clock_20')[0]?.options).toEqual({ offsetSec: 0 });

    tick(5000);
    expect(engine(h).fastMoney?.clock.remainingMs).toBe(FM_P1_MS - 5000);

    h.controller.setInputLocked(true);
    tick(30_000);
    expect(engine(h).fastMoney?.clock.remainingMs).toBe(FM_P1_MS - 5000);
    h.controller.setInputLocked(false);
    tick(1000);
    expect(engine(h).fastMoney?.clock.remainingMs).toBe(FM_P1_MS - 6000);
  });

  it('credits the real time that passed, not the number of ticks', () => {
    const h = makeHarness({ settings: quick });
    toFastMoney(h);
    h.controller.run('advance');
    vi.setSystemTime(Date.now() + 3000); // a throttled tab: no interval fired meanwhile
    tick(FEUD_TIMING.fmTickMs);
    expect(engine(h).fastMoney?.clock.remainingMs).toBe(FM_P1_MS - 3000 - FEUD_TIMING.fmTickMs);
  });

  it('restarts the clock bed with an offset when the clock resumes', () => {
    const h = makeHarness({ settings: quick });
    toFastMoney(h);
    h.controller.run('advance');
    tick(4000);
    expect(h.host.send('fm-pause')).toEqual({ applied: true });
    expect(h.audio.calls.filter((c) => c.kind === 'stop' && c.cue === 'ff_fm_clock_20')).toHaveLength(1);
    tick(10_000);
    expect(engine(h).fastMoney?.clock.remainingMs).toBe(FM_P1_MS - 4000);
    expect(h.host.send('fm-resume')).toEqual({ applied: true });
    const beds = h.audio.beds('ff_fm_clock_20');
    expect(beds).toHaveLength(2);
    expect(beds[1]?.options).toEqual({ offsetSec: 4 });
  });

  it('plays the end-of-turn, blip, points and zero cues and finishes with the jackpot fanfare once', () => {
    const h = makeHarness({ settings: quick });
    toFastMoney(h);
    h.controller.run('advance');
    // Player 1 hits the top answer on every question: 5 x 40 = 200 points.
    for (let i = 0; i < 5; i += 1) fmType(h, 0);
    expect(engine(h).fastMoney?.phase).toBe('p1-reveal');
    expect(h.audio.played('ff_fm_done')).toBe(1);
    expect(h.audio.calls.filter((c) => c.kind === 'stop' && c.cue === 'ff_fm_clock_20')).toHaveLength(1);

    for (let i = 0; i < 10; i += 1) h.controller.run('advance');
    expect(h.audio.played('ff_fm_blip')).toBe(5);
    expect(h.audio.played('ff_fm_points')).toBe(5);
    tick(FEUD_TIMING.fmWinDelayMs);
    expect(h.audio.played('ff_fm_win')).toBe(1);
    h.controller.run('advance'); // clear the board: Player 1 alone reached 200
    expect(engine(h).phase).toBe('game-over');
    expect(h.audio.played('ff_fm_win')).toBe(1);
    expect(h.audio.played('applause')).toBe(1); // only the round's applause, not the final one
    h.controller.run('advance');
    expect(h.onGameEnd).toHaveBeenCalledWith(
      expect.objectContaining({ roundScore: 95 + 200, bonusChips: 1 }),
    );
  });

  it('puts a near miss in Fast Money on the host check list with a suggestion', () => {
    const h = makeHarness({ settings: quick, content: { surveys: [FOOD], fastMoney: CONTENT.fastMoney } });
    toFastMoney(h);
    h.controller.run('advance');
    const fm = engine(h).fastMoney;
    const q = fm?.queue[0] ?? 0;
    const target = fm?.questions[q]?.answers[0]?.answer ?? '';
    h.host.send('submit-text', { text: `${target} now` });
    expect(h.host.data.fmChecks).toHaveLength(1);
    expect(h.host.data.fmChecks[0]?.suggested).toBe(0);
    tick(1000);
    // The host rules it in: the check clears.
    h.host.send('fm-set-match', { player: 1, question: q, slot: 0 });
    expect(h.host.data.fmChecks).toHaveLength(0);
  });

  it('plays the duplicate buzzer on request and when player 2 repeats player 1', () => {
    const h = makeHarness({ settings: quick });
    toFastMoney(h);
    h.controller.run('advance');
    for (let i = 0; i < 5; i += 1) fmType(h, 1);
    for (let i = 0; i < 11; i += 1) h.controller.run('advance');
    expect(engine(h).fastMoney?.phase).toBe('p2-ready');
    h.controller.run('advance');
    const q = engine(h).fastMoney?.queue[0] ?? 0;
    fmType(h, 1); // same survey answer as player 1 on this question
    const asked = engine(h).fastMoney?.queue[0];
    expect(asked).toBe(q);
    expect(h.audio.played('ff_fm_duplicate')).toBe(1);
    h.host.send('fm-duplicate-buzzer');
    expect(h.audio.played('ff_fm_duplicate')).toBe(2);
  });
});

describe('FeudController: answer sources and phones', () => {
  it('takes a phone answer only from the answering team and only when phones may answer', () => {
    const h = makeHarness({ settings: { ...quick, answersFrom: 'phones' } });
    toFirstAnswer(h);
    expect(h.phones.last).toMatchObject({ activeTeam: 1, offLabel: 'TYPE YOUR ANSWER', buzzTeams: [] });

    h.phones.answer(2, 'pizza', 'wrong-team');
    expect(h.phones.lastAck()).toEqual({ team: 2, pressId: 'wrong-team', accepted: false });
    expect(h.controller.getSnapshot().surveySays).toBe(false);

    expect(h.host.send('submit-text', { text: 'pizza' }).applied).toBe(false);

    h.phones.answer(1, 'pizza', 'right-team');
    expect(h.phones.lastAck()).toEqual({ team: 1, pressId: 'right-team', accepted: true });
    tick(FEUD_TIMING.surveySaysMs);
    expect(engine(h).board[0]?.revealed).toBe(true);

    h.phones.answer(1, 'burger', 'late');
    expect(h.phones.lastAck()?.accepted).toBe(false);
  });

  it('ignores phone answers when only the host may answer', () => {
    const h = makeHarness({ settings: quick });
    toFirstAnswer(h);
    expect(h.phones.last?.offLabel).not.toBe('TYPE YOUR ANSWER');
    h.phones.answer(1, 'pizza', 'nope');
    expect(h.phones.lastAck()?.accepted).toBe(false);
    expect(h.host.send('submit-text', { text: 'pizza' }).applied).toBe(true);
  });

  it('sends a near-miss phone answer to host review instead of ruling it', () => {
    const h = makeHarness({
      settings: { ...quick, answersFrom: 'both' },
      content: { surveys: [COMMS], fastMoney: CONTENT.fastMoney },
    });
    toFirstAnswer(h);
    h.phones.answer(1, 'phone call now', 'near');
    expect(h.host.data.pendingReview).toMatchObject({
      text: 'phone call now',
      suggestedSlot: 0,
      suggestedAnswer: 'PHONE CALL',
    });
    expect(engine(h).board[0]?.revealed).toBe(false);
    expect(h.host.data.controls.some((c) => c.id === 'advance')).toBe(false);

    expect(h.host.send('review-accept', { slot: 0 }).applied).toBe(true);
    tick(FEUD_TIMING.surveySaysMs);
    expect(engine(h).board[0]?.revealed).toBe(true);
    expect(h.host.data.pendingReview).toBeNull();
  });

  it('lets the host rule a review as a miss', () => {
    const h = makeHarness({ settings: quick, content: { surveys: [COMMS], fastMoney: CONTENT.fastMoney } });
    toFirstAnswer(h);
    h.host.send('submit-text', { text: 'phone call now' });
    expect(h.host.data.pendingReview).not.toBeNull();
    expect(h.host.send('review-miss').applied).toBe(true);
    expect(engine(h).faceOff?.stage).toBe('second-answer');
    expect(h.host.data.pendingReview).toBeNull();
  });

  it('accepts a phone press only while the face-off window is open and only from the two match teams', () => {
    const h = makeHarness({ settings: quick });
    h.controller.run('advance');
    h.phones.press(1, 'early');
    expect(h.phones.lastAck()).toEqual({ team: 1, pressId: 'early', accepted: false });
    expect(engine(h).faceOff?.first).toBeNull();

    h.controller.run('advance');
    expect(h.phones.last).toMatchObject({ buzzTeams: [1, 2], offLabel: 'Not in this match' });
    h.phones.press(3, 'outsider');
    expect(h.phones.lastAck()).toEqual({ team: 3, pressId: 'outsider', accepted: false });

    h.phones.press(2, 'second-team');
    expect(h.phones.lastAck()).toEqual({ team: 2, pressId: 'second-team', accepted: true });
    expect(engine(h).faceOff?.first).toBe('B');

    h.phones.press(1, 'too-late');
    expect(h.phones.lastAck()).toEqual({ team: 1, pressId: 'too-late', accepted: false });
    expect(engine(h).faceOff?.first).toBe('B');
  });

  it('answers a retried press with the first result and refuses presses while paused', () => {
    const h = makeHarness({ settings: quick });
    h.controller.run('advance');
    h.controller.run('advance');
    h.controller.setInputLocked(true);
    h.phones.press(1, 'locked');
    expect(h.phones.lastAck()?.accepted).toBe(false);
    h.controller.setInputLocked(false);
    h.phones.press(1, 'ok');
    h.phones.press(1, 'ok');
    expect(h.phones.acks.filter((a) => a.pressId === 'ok')).toEqual([
      { team: 1, pressId: 'ok', accepted: true },
      { team: 1, pressId: 'ok', accepted: true },
    ]);
  });

  it('takes the host hotkey buzz as a stamped command for a match team', () => {
    const h = makeHarness({ settings: quick });
    h.controller.run('advance');
    h.controller.run('advance');
    expect(h.host.send('buzz', {}, { teamId: 3 }).applied).toBe(false);
    expect(h.host.send('buzz', {}, { teamId: 2 }).applied).toBe(true);
    expect(engine(h).faceOff?.first).toBe('B');
  });
});

describe('FeudController: voice', () => {
  const voiceHarness = (extra: HarnessOptions = {}): Harness =>
    makeHarness({ voice: true, settings: { ...quick, voice: 'on' }, ...extra });

  it('listens to the face-off player with a session tied to that turn and judges alternatives', () => {
    const h = voiceHarness();
    h.controller.run('advance');
    expect(h.recognizer.live).toHaveLength(0); // buzzers not open yet
    h.controller.run('advance');
    expect(h.recognizer.live).toHaveLength(0); // nobody answers yet
    h.phones.press(1, 'p');
    expect(h.recognizer.live).toHaveLength(1);
    expect(h.host.data.mic.status).toBe('listening');

    h.recognizer.say(h.recognizer.live[0], ['piece a', 'pizza'], false);
    expect(h.host.data.mic.transcript).toBe('piece a');
    h.recognizer.say(h.recognizer.live[0], ['piece a', 'pizza'], true);
    expect(h.speak).toHaveBeenCalledWith('Survey says');
    tick(FEUD_TIMING.surveySaysMs);
    expect(engine(h).board[0]?.revealed).toBe(true);
  });

  it('discards a late result that belongs to the previous player', () => {
    const h = voiceHarness();
    toFirstAnswer(h);
    const first = h.recognizer.live[0];
    expect(first).toBeDefined();
    // The host rules the first player a miss; the second family's player is now up.
    h.host.send('strike');
    expect(first?.stopped).toBe(true);
    expect(h.recognizer.live).toHaveLength(1);
    expect(engine(h).faceOff?.stage).toBe('second-answer');
    // A straggling result from the old session still arrives.
    first?.handlers.onResult(['pizza'], true);
    expect(h.speak).not.toHaveBeenCalled();
    expect(engine(h).faceOff?.stage).toBe('second-answer');
    expect(h.host.data.pendingReview).toBeNull();
  });

  it('stops listening for the turn once the host types, and starts again for the next player', () => {
    const h = voiceHarness();
    toFirstAnswer(h);
    const session = h.recognizer.live[0];
    h.host.send('hold-answer');
    expect(session?.stopped).toBe(true);
    expect(h.recognizer.live).toHaveLength(0);
    expect(h.host.data.mic.status).toBe('off');
    h.host.send('strike');
    expect(h.recognizer.live).toHaveLength(1);
  });

  it('restarts a session that ends by itself three times, then gives up for that turn', () => {
    const h = voiceHarness();
    toFirstAnswer(h);
    for (let round = 0; round < 3; round += 1) {
      h.recognizer.end(h.recognizer.live[0]);
      expect(h.recognizer.live).toHaveLength(1);
    }
    expect(h.recognizer.sessions).toHaveLength(4);
    h.recognizer.end(h.recognizer.live[0]);
    expect(h.recognizer.live).toHaveLength(0);
    expect(h.host.data.mic.status).toBe('stopped');
    // The host's Mic button tries again.
    h.host.send('mic', { on: true });
    expect(h.recognizer.live).toHaveLength(1);
  });

  it('counts only quick endings: a session that lasted a while resets the count', () => {
    const h = voiceHarness();
    toFirstAnswer(h);
    for (let round = 0; round < 6; round += 1) {
      tick(FEUD_TIMING.voiceRestartWindowMs + 1);
      h.recognizer.end(h.recognizer.live[0]);
      expect(h.recognizer.live).toHaveLength(1);
    }
  });

  it('never listens on its own at the steal, and sends a spoken steal answer to host review', () => {
    const h = voiceHarness();
    toControl(h);
    strikes(h, 3);
    h.controller.run('advance'); // take the captain's answer
    expect(engine(h).phase).toBe('steal-answer');
    expect(h.recognizer.live).toHaveLength(0);

    h.host.send('mic', { on: true });
    expect(h.recognizer.live).toHaveLength(1);
    h.recognizer.say(h.recognizer.live[0], ['burger'], true);
    expect(engine(h).phase).toBe('steal-answer');
    expect(h.host.data.pendingReview).toMatchObject({ role: 'steal', suggestedSlot: 1, source: 'voice' });

    h.host.send('review-accept', { slot: 1 });
    tick(FEUD_TIMING.surveySaysMs);
    expect(engine(h).steal?.result).toBe('success');
  });

  it('does not listen in Fast Money or when voice is off or unavailable', () => {
    const off = makeHarness({ voice: true, settings: quick });
    toFirstAnswer(off);
    expect(off.recognizer.sessions).toHaveLength(0);

    const missing = makeHarness({ voice: false, settings: { ...quick, voice: 'on' } });
    toFirstAnswer(missing);
    expect(missing.host.data.mic.status).toBe('unavailable');

    const fm = voiceHarness();
    toGameWon(fm);
    fm.controller.run('advance');
    fm.controller.run('advance');
    expect(fm.recognizer.live).toHaveLength(0);
  });
});

describe('FeudController: commands', () => {
  it('drops a command stamped with an older game revision', () => {
    const h = makeHarness({ settings: quick });
    toFirstAnswer(h);
    const stale = h.host.gameRev - 1;
    const outcome = h.host.send('judge-slot', { slot: 0 }, { gameRev: stale });
    expect(outcome).toEqual({ applied: false, reason: 'That moment has passed' });
    expect(engine(h).board[0]?.revealed).toBe(false);
    expect(h.controller.getSnapshot().surveySays).toBe(false);
  });

  it('drops a command that repeats within half a second, by id and by content', () => {
    const h = makeHarness({ settings: { ...quick } });
    toControl(h);
    expect(h.host.send('strike', undefined, { cmdId: 'same' }).applied).toBe(true);
    const sameId = h.host.send('strike', undefined, { cmdId: 'same' });
    expect(sameId).toEqual({ applied: false, reason: 'Repeated within half a second' });
    const sameAction = h.host.send('strike', undefined, { cmdId: 'other' });
    expect(sameAction.applied).toBe(false);
    expect(engine(h).strikes).toBe(1);
    tick(FEUD_TIMING.repeatDropMs);
    expect(h.host.send('strike', undefined, { cmdId: 'later' }).applied).toBe(true);
    expect(engine(h).strikes).toBe(2);
  });

  it('drops a ruling stamped for a team whose turn has passed', () => {
    const h = makeHarness({ settings: quick });
    toControl(h);
    const outcome = h.host.send('strike', undefined, { teamId: 2 });
    expect(outcome.applied).toBe(false);
    expect(engine(h).strikes).toBe(0);
    expect(h.host.send('strike', undefined, { teamId: 1 }).applied).toBe(true);
  });

  it('refuses every command while paused and rejects unknown ones', () => {
    const h = makeHarness({ settings: quick });
    h.controller.setInputLocked(true);
    expect(h.host.send('advance')).toEqual({
      applied: false,
      reason: 'The game is paused or showing a dialog',
    });
    h.controller.setInputLocked(false);
    expect(h.host.send('advance').applied).toBe(true);
    expect(h.host.send('dance')).toEqual({ applied: false, reason: 'Unknown command: dance' });
  });

  it('supports the board tools: multiplier, replace survey, reveal leftovers and undo', () => {
    const h = makeHarness({ settings: quick });
    toControl(h);
    expect(h.host.send('set-multiplier', { value: 2 }).applied).toBe(true);
    expect(engine(h).multiplier).toBe(2);
    expect(h.host.send('set-multiplier', { value: 4 }).applied).toBe(false);
    const before = engine(h).survey?.id;
    h.host.send('replace-survey');
    expect(engine(h).survey?.id).not.toBe(before);
    expect(engine(h).phase).toBe('face-off');
    expect(h.host.send('undo').applied).toBe(true);
    expect(engine(h).survey?.id).toBe(before);
    expect(h.host.send('use-survey', { id: 'sudden' }).applied).toBe(true);
    expect(engine(h).survey?.id).toBe('sudden');
  });

  it('reveals the leftovers bottom-up after a steal round', () => {
    const h = makeHarness({ settings: quick });
    toControl(h);
    strikes(h, 3);
    h.controller.run('advance');
    h.host.send('strike'); // steal fails
    expect(engine(h).phase).toBe('round-decided');
    expect(h.audio.played('ff_bank_award')).toBe(1);
    h.host.send('reveal-next');
    expect(engine(h).board[4]?.revealed).toBe(true);
    tick(FEUD_TIMING.repeatDropMs + 100);
    h.host.send('reveal-all');
    expect(engine(h).phase).toBe('round-summary');
    expect(h.audio.played('ff_reveal')).toBeGreaterThanOrEqual(5);
  });

  it('browses the question bank only while it is open and counts fresh content', () => {
    const h = makeHarness({ settings: quick, usedContentIds: ['colors'] });
    expect(h.host.data.content.browser).toBeNull();
    expect(h.host.data.content).toMatchObject({ freshSurveys: 2, totalSurveys: 3, runningLow: true });
    h.host.send('browse', { open: true });
    expect(h.host.data.content.browser?.find((entry) => entry.id === 'colors')?.used).toBe(true);
    h.host.send('browse', { open: false });
    expect(h.host.data.content.browser).toBeNull();
  });

  it('keeps the published host snapshot under the realtime size limit with Fast Money data', () => {
    const h = makeHarness({ settings: quick });
    toGameWon(h);
    h.controller.run('advance');
    h.host.send('browse', { open: true });
    const size = JSON.stringify(h.host.snapshots.at(-1)).length;
    expect(size).toBeLessThan(32 * 1024);
  });
});

describe('FeudController: cues and persistence', () => {
  const cuesIn = (h: Harness): string[] =>
    h.audio.calls.filter((c) => c.kind === 'play').map((c) => String(c.cue));

  it('plays each engine event once, even when nothing new happens or the game is paused and restored', () => {
    const h = makeHarness({ settings: quick });
    toControl(h);
    strikes(h, 1);
    tick(FEUD_TIMING.awwDelayMs);
    expect(h.audio.played('ff_strike')).toBe(1);
    expect(h.audio.played('ff_crowd_aww')).toBe(1);

    h.host.send('hold-answer');
    h.controller.setInputLocked(true);
    h.controller.setInputLocked(false);
    h.host.send('browse', { open: true });
    h.controller.updateSettings({ voice: 'off' });
    tick(10_000);
    expect(h.audio.played('ff_strike')).toBe(1);
    expect(h.audio.played('ff_crowd_aww')).toBe(1);

    // An undo adds an UNDONE event and plays nothing, and a delayed cue still waiting is dropped.
    h.host.send('strike');
    h.host.send('undo');
    tick(10_000);
    expect(h.audio.played('ff_strike')).toBe(2);
    expect(h.audio.played('ff_crowd_aww')).toBe(1);
  });

  it('plays the cues of a decided round: bank award, applause, then the sting', () => {
    const h = makeHarness({ settings: { answerTimerSec: 0, format: 'full' } });
    toControl(h);
    for (const slot of [1, 2, 3, 4]) rule(h, slot);
    expect(h.audio.played('ff_bank_award')).toBe(1);
    expect(h.audio.played('applause')).toBe(1);
    expect(h.audio.played('ff_round_sting')).toBe(1);
    tick(FEUD_TIMING.roundStingAfterWinMs);
    expect(h.audio.played('ff_round_sting')).toBe(2);
    expect(cuesIn(h).filter((cue) => cue === 'ff_reveal').length).toBe(5);
  });

  it('calls onStateChange after every change with a serialisable snapshot', () => {
    const h = makeHarness({ settings: quick });
    toFirstAnswer(h);
    const calls = h.onStateChange.mock.calls.length;
    expect(calls).toBeGreaterThan(2);
    const last = h.onStateChange.mock.calls.at(-1)?.[0] as unknown;
    expect(JSON.parse(JSON.stringify(last))).toEqual(last);
  });

  it('restores the engine and re-arms the answer clock from the remaining time', () => {
    const first = makeHarness({ settings: { format: 'one-round', answerTimerSec: 5 } });
    toControl(first);
    tick(2000);
    const saved = JSON.parse(JSON.stringify(first.controller.getSavedState())) as unknown;
    first.controller.stop();

    const second = makeHarness({
      settings: { format: 'one-round', answerTimerSec: 5 },
      initialState: saved,
    });
    expect(second.controller.getEngineState()).toEqual(first.controller.getEngineState());
    expect(second.host.data.view.phase).toBe('control');
    expect(second.host.data.clocks.answer?.remainingMs).toBe(3000);
    expect(second.audio.calls.filter((c) => c.kind === 'play')).toHaveLength(0);
    tick(2999);
    expect(second.controller.getEngineState().strikes).toBe(0);
    tick(1);
    expect(second.controller.getEngineState().strikes).toBe(1);
  });

  it('restores a running Fast Money clock with its bed offset and the remaining time', () => {
    const first = makeHarness({ settings: quick });
    toGameWon(first);
    first.controller.run('advance');
    first.controller.run('advance');
    tick(7000);
    const saved = JSON.parse(JSON.stringify(first.controller.getSavedState())) as unknown;
    first.controller.stop();

    const second = makeHarness({ settings: quick, initialState: saved });
    expect(second.audio.beds('ff_fm_clock_20')[0]?.options).toEqual({ offsetSec: 7 });
    tick(1000);
    expect(second.controller.getEngineState().fastMoney?.clock.remainingMs).toBe(FM_P1_MS - 8000);
  });

  it('does not report the game again when restored after the report', () => {
    const first = makeHarness({ settings: quick });
    toGameWon(first);
    first.host.send('skip-fm');
    first.controller.run('continue');
    expect(first.onGameEnd).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(JSON.stringify(first.controller.getSavedState())) as unknown;

    const second = makeHarness({ settings: quick, initialState: saved });
    expect(second.controller.run('continue').applied).toBe(false);
    expect(second.onGameEnd).not.toHaveBeenCalled();
  });

  it('starts fresh when the saved state does not fit', () => {
    const h = makeHarness({ settings: quick, initialState: { version: 1, engine: { phase: 3 } } });
    expect(h.controller.getEngineState().phase).toBe('pre-game');
  });

  it('stops all timers and listeners on stop()', () => {
    const h = makeHarness({ settings: { format: 'one-round', answerTimerSec: 5 } });
    toControl(h);
    h.controller.stop();
    tick(60_000);
    expect(engine(h).strikes).toBe(0);
    expect(() => h.host.send('strike')).toThrow();
  });
});

describe('FeudController: Sudden Death', () => {
  const suddenDeathState = () => {
    // Four undecided rounds, then NEXT_ROUND: waiting for the Sudden Death question. Teams 1 and 2 play.
    const state = feudReducer(afterFourRounds({ targetScore: 500 }), { type: 'NEXT_ROUND' });
    return {
      version: 1,
      engine: {
        ...state,
        families: {
          A: { ...state.families.A, teamId: '1' },
          B: { ...state.families.B, teamId: '2' },
        },
      },
      gameRev: 0,
      usedLocal: [],
      endReported: false,
      jackpotCued: false,
      review: null,
      fmChecks: [],
      clocks: { answer: null, steal: null },
    };
  };

  it('starts the Sudden Death question from Enter and ends the game on the top answer', () => {
    const h = makeHarness({
      settings: { answerTimerSec: 0, targetScore: 500 },
      initialState: suddenDeathState(),
      content: { surveys: [SUDDEN], fastMoney: CONTENT.fastMoney },
    });
    expect(engine(h).phase).toBe('sudden-death');
    expect(h.audio.calls).toHaveLength(0);
    h.controller.run('advance');
    expect(engine(h).board).toHaveLength(1);
    expect(engine(h).suddenDeath).toBe(true);
    expect(h.audio.played('ff_round_sting')).toBe(0);
    h.controller.run('advance');
    h.phones.press(2, 'sd');
    h.host.send('submit-text', { text: 'saturday' });
    tick(FEUD_TIMING.surveySaysMs);
    expect(engine(h).gameWinner).toBe('B');
    expect(h.audio.played('ff_bank_award')).toBe(1);
    expect(h.audio.played('ff_round_sting')).toBe(0);
  });
});

describe('FeudController: view model', () => {
  const audienceJson = (controller: FeudController): string => JSON.stringify(controller.getSnapshot());

  it('keeps hidden answers and aliases out of the stage view model until they are revealed', () => {
    const h = makeHarness({ settings: quick });
    toControl(h);
    const json = audienceJson(h.controller);
    for (const hidden of ['BURGER', 'TACOS', 'SALAD', 'SOUP', 'burger', 'pie']) {
      expect(json).not.toContain(hidden);
    }
    expect(json).toContain('PIZZA');
    rule(h, 2);
    expect(audienceJson(h.controller)).toContain('TACOS');
    expect(audienceJson(h.controller)).not.toContain('BURGER');
  });

  it('exposes the host buttons for the moment and a team-aware match label', () => {
    const h = makeHarness({ settings: quick });
    h.deps.match.number = 2;
    h.deps.match.of = 3;
    expect(h.controller.getSnapshot().advanceLabel).toBe('Start round 1');
    h.controller.run('advance');
    expect(h.controller.getSnapshot().advanceLabel).toBe('Start the face-off');
    expect(h.controller.getSnapshot().controls.map((c) => c.id)).toContain('advance');
    expect(h.controller.getSnapshot().matchLabel).toBe('Match 2 of 3');
  });

  it('shows the big X with the strike count and clears it', () => {
    const h = makeHarness({ settings: quick });
    toControl(h);
    expect(h.controller.getSnapshot().overlay).toBeNull();
    strikes(h, 2);
    expect(h.controller.getSnapshot().overlay?.count).toBe(2);
    tick(FEUD_TIMING.strikeOverlayMs);
    expect(h.controller.getSnapshot().overlay).toBeNull();
  });

  it('returns the same snapshot object until something changes', () => {
    const h = makeHarness({ settings: quick });
    const a = h.controller.getSnapshot();
    expect(h.controller.getSnapshot()).toBe(a);
    h.controller.run('advance');
    expect(h.controller.getSnapshot()).not.toBe(a);
  });

  it('notifies subscribers on each change', () => {
    const h = makeHarness({ settings: quick });
    const listener = vi.fn();
    const off = h.controller.subscribe(listener);
    h.controller.run('advance');
    expect(listener).toHaveBeenCalled();
    off();
    listener.mockClear();
    h.controller.run('advance');
    expect(listener).not.toHaveBeenCalled();
  });
});
