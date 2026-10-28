import { describe, expect, it } from 'vitest';
import {
  FM_P1_MS,
  FM_P2_MS,
  REVEAL_STEPS,
  createFastMoney,
  fastMoneyTotal,
  legalFastMoneyActions,
  reduceFastMoney,
  shownPoints,
} from './fastMoney';
import { survey } from './testFixtures';
import type { FastMoneyAction, FastMoneyState, FeudSurveyInput } from './types';

/** Question i: slot 0 is worth `top`, then 30, 20, 10. */
const question = (i: number, top = 40): FeudSurveyInput =>
  survey(`fm-${i}`, [
    [`Alpha ${i}`, top],
    [`Beta ${i}`, 30],
    [`Gamma ${i}`, 20],
    [`Delta ${i}`, 10],
  ]);

const questions = (top = 40): FeudSurveyInput[] => [0, 1, 2, 3, 4].map((i) => question(i, top));

const go = (fm: FastMoneyState, ...actions: FastMoneyAction[]): FastMoneyState =>
  actions.reduce((current, action) => reduceFastMoney(current, action), fm);

const ready = (top = 40, podiumSize = 5): FastMoneyState =>
  go(
    createFastMoney({ family: 'A', podiumSize }),
    { type: 'PROVIDE_QUESTIONS', questions: questions(top) },
    { type: 'CHOOSE_PLAYERS', p1: 0, p2: podiumSize > 1 ? 1 : 0 },
  );

const answer = (
  slot: number | null,
  text = slot === null ? 'nothing' : `a${slot}`,
  group?: string,
): FastMoneyAction => ({
  type: 'ANSWER',
  text,
  judged: group === undefined ? { slot } : { slot, group },
});

/** Player 1 answers the five questions with the given slots (in order), then it is time to reveal. */
const p1Answers = (slots: (number | null)[], top = 40): FastMoneyState =>
  go(ready(top), { type: 'START_CLOCK' }, ...slots.map((slot, index) => answer(slot, `p1 q${index}`)));

/** Reveals the current player's whole sequence, up to the phase change that follows it. */
const revealAll = (fm: FastMoneyState): FastMoneyState => {
  let current = fm;
  const phase = fm.phase;
  while (current.phase === phase) {
    const next = reduceFastMoney(current, { type: 'REVEAL_NEXT' });
    if (next === current) break;
    current = next;
  }
  return current;
};

/** Player 1 revealed (not a jackpot), Player 2 ready. */
const atP2Ready = (p1Slots: (number | null)[] = [1, 1, 1, 1, 1]): FastMoneyState =>
  revealAll(p1Answers(p1Slots));

const eventTypes = (fm: FastMoneyState): string[] => fm.events.map((event) => event.type);

describe('Fast Money 1. Player 2 waits', () => {
  it('"Player 2 waits where they cannot see or hear the board": Player 2 cannot start before Player 1 is revealed', () => {
    const playing = go(ready(), { type: 'START_CLOCK' });
    expect(playing.phase).toBe('p1-playing');
    expect(reduceFastMoney(playing, { type: 'START_CLOCK' })).toBe(playing);
    const revealing = go(playing, ...[0, 0, 0, 0, 0].map((slot) => answer(slot)));
    expect(revealing.phase).toBe('p1-reveal');
    expect(reduceFastMoney(revealing, { type: 'START_CLOCK' })).toBe(revealing);
  });

  it('chooses two different players of the winning family', () => {
    const fm = createFastMoney({ family: 'B', podiumSize: 4 });
    expect(reduceFastMoney(fm, { type: 'CHOOSE_PLAYERS', p1: 2, p2: 2 })).toBe(fm);
    expect(reduceFastMoney(fm, { type: 'CHOOSE_PLAYERS', p1: 0, p2: 4 })).toBe(fm);
    expect(reduceFastMoney(fm, { type: 'CHOOSE_PLAYERS', p1: -1, p2: 1 })).toBe(fm);
    const chosen = go(fm, { type: 'CHOOSE_PLAYERS', p1: 3, p2: 1 });
    expect(chosen.players).toEqual({ p1: 3, p2: 1 });
    // A one-person family plays both parts.
    const solo = go(createFastMoney({ family: 'A', podiumSize: 1 }), {
      type: 'CHOOSE_PLAYERS',
      p1: 0,
      p2: 0,
    });
    expect(solo.players).toEqual({ p1: 0, p2: 0 });
  });

  it('needs five questions and both players before the first clock', () => {
    const fm = createFastMoney({ family: 'A', podiumSize: 5 });
    expect(reduceFastMoney(fm, { type: 'START_CLOCK' })).toBe(fm);
    expect(reduceFastMoney(fm, { type: 'PROVIDE_QUESTIONS', questions: questions().slice(0, 4) })).toBe(fm);
    const questionsOnly = go(fm, { type: 'PROVIDE_QUESTIONS', questions: questions() });
    expect(questionsOnly.phase).toBe('setup');
    expect(go(questionsOnly, { type: 'CHOOSE_PLAYERS', p1: 0, p2: 1 }).phase).toBe('p1-ready');
  });
});

describe('Fast Money 2. Player 1 and the 20 second clock', () => {
  it('"Player 1 gets 20 seconds for five questions; the clock starts after the host finishes reading the first question"', () => {
    const waiting = ready();
    expect(waiting.clock).toEqual({ remainingMs: FM_P1_MS, running: false });
    expect(reduceFastMoney(waiting, { type: 'TICK', ms: 1000 })).toBe(waiting);
    const started = go(waiting, { type: 'START_CLOCK' });
    expect(FM_P1_MS).toBe(20_000);
    expect(started.clock).toEqual({ remainingMs: 20_000, running: true });
    expect(started.queue).toEqual([0, 1, 2, 3, 4]);
  });

  it('the clock is advanced by TICK and ends the turn at zero', () => {
    let fm = go(ready(), { type: 'START_CLOCK' }, { type: 'TICK', ms: 7500 });
    expect(fm.clock).toEqual({ remainingMs: 12_500, running: true });
    expect(fm.phase).toBe('p1-playing');
    fm = go(fm, { type: 'TICK', ms: 12_499 });
    expect(fm.phase).toBe('p1-playing');
    fm = go(fm, { type: 'TICK', ms: 5 });
    expect(fm.phase).toBe('p1-reveal');
    expect(fm.clock).toEqual({ remainingMs: 0, running: false });
    expect(eventTypes(fm)).toContain('TIME_UP');
    expect(reduceFastMoney(fm, { type: 'TICK', ms: 100 })).toBe(fm);
  });

  it('ticks ignore non-positive or non-finite values', () => {
    const fm = go(ready(), { type: 'START_CLOCK' });
    expect(reduceFastMoney(fm, { type: 'TICK', ms: 0 })).toBe(fm);
    expect(reduceFastMoney(fm, { type: 'TICK', ms: -5 })).toBe(fm);
    expect(reduceFastMoney(fm, { type: 'TICK', ms: Number.NaN })).toBe(fm);
  });

  it('the host can pause and resume the clock', () => {
    const fm = go(ready(), { type: 'START_CLOCK' }, { type: 'TICK', ms: 1000 }, { type: 'PAUSE' });
    expect(fm.clock.running).toBe(false);
    expect(reduceFastMoney(fm, { type: 'TICK', ms: 1000 })).toBe(fm);
    expect(reduceFastMoney(fm, { type: 'PAUSE' })).toBe(fm);
    const resumed = go(fm, { type: 'RESUME' });
    expect(resumed.clock).toEqual({ remainingMs: 19_000, running: true });
    expect(reduceFastMoney(resumed, { type: 'RESUME' })).toBe(resumed);
  });

  it('"\\"Pass\\" skips a question; passed questions come back if time remains"', () => {
    let fm = go(ready(), { type: 'START_CLOCK' }, { type: 'PASS' });
    expect(fm.queue).toEqual([1, 2, 3, 4, 0]);
    fm = go(fm, answer(0), answer(0), answer(0), answer(0));
    expect(fm.queue).toEqual([0]);
    expect(fm.phase).toBe('p1-playing');
    fm = go(fm, answer(1));
    expect(fm.phase).toBe('p1-reveal');
    expect(fm.records.p1[0]?.slot).toBe(1);
    // Everything answered before the clock ran out: the remaining time is kept for the record.
    expect(fm.clock.running).toBe(false);
  });

  it('a pass with one question left keeps asking it', () => {
    const fm = go(ready(), { type: 'START_CLOCK' }, answer(0), answer(0), answer(0), answer(0));
    expect(fm.queue).toEqual([4]);
    expect(go(fm, { type: 'PASS' }).queue).toEqual([4]);
  });

  it('"The screen shows a question only while a player is answering"', () => {
    const view = (fm: FastMoneyState) =>
      fm.queue.length > 0 && (fm.phase === 'p1-playing' || fm.phase === 'p2-playing');
    expect(view(ready())).toBe(false);
    expect(view(go(ready(), { type: 'START_CLOCK' }))).toBe(true);
    expect(view(p1Answers([0, 0, 0, 0, 0]))).toBe(false);
  });

  it('a passed question that is never answered scores nothing', () => {
    const fm = go(
      ready(),
      { type: 'START_CLOCK' },
      answer(0),
      { type: 'PASS' },
      { type: 'TICK', ms: 20_000 },
    );
    expect(fm.phase).toBe('p1-reveal');
    expect(fm.records.p1[0]?.slot).toBe(0);
    expect(fm.records.p1[1]).toBeNull();
  });

  it('empty answers and slots off the survey are refused', () => {
    const fm = go(ready(), { type: 'START_CLOCK' });
    expect(reduceFastMoney(fm, { type: 'ANSWER', text: '  ', judged: { slot: null } })).toBe(fm);
    expect(reduceFastMoney(fm, { type: 'ANSWER', text: 'x', judged: { slot: 9 } })).toBe(fm);
    expect(reduceFastMoney(fm, { type: 'ANSWER', text: 'x', judged: { slot: -1 } })).toBe(fm);
  });
});

describe('Fast Money 3. The reveal', () => {
  it('"Player 1\'s answers are revealed one by one (You said... Survey said...), then the board is cleared except the total"', () => {
    let fm = p1Answers([0, 1, null, 2, 3]);
    expect(fm.phase).toBe('p1-reveal');
    const kinds: string[] = [];
    for (let step = 0; step < REVEAL_STEPS; step += 1) {
      fm = go(fm, { type: 'REVEAL_NEXT' });
      const last = fm.events.at(-1);
      kinds.push(last?.type ?? '');
    }
    expect(kinds).toEqual([
      'YOU_SAID',
      'SURVEY_SAID',
      'YOU_SAID',
      'SURVEY_SAID',
      'YOU_SAID',
      'SURVEY_SAID',
      'YOU_SAID',
      'SURVEY_SAID',
      'YOU_SAID',
      'SURVEY_SAID',
      'BOARD_CLEARED',
    ]);
    expect(fm.events.at(-1)).toMatchObject({ type: 'BOARD_CLEARED', total: 40 + 30 + 0 + 20 + 10 });
  });

  it("each step reveals the player's text and then the survey answer with the running total", () => {
    let fm = p1Answers([0, 1, null, 2, 3]);
    fm = go(fm, { type: 'REVEAL_NEXT' });
    expect(fm.events.at(-1)).toMatchObject({ type: 'YOU_SAID', question: 0, text: 'p1 q0' });
    expect(fastMoneyTotal(fm)).toBe(0);
    fm = go(fm, { type: 'REVEAL_NEXT' });
    expect(fm.events.at(-1)).toMatchObject({
      type: 'SURVEY_SAID',
      question: 0,
      answer: 'Alpha 0',
      points: 40,
      total: 40,
    });
    fm = go(fm, { type: 'REVEAL_NEXT' }, { type: 'REVEAL_NEXT' });
    expect(fm.events.at(-1)).toMatchObject({ type: 'SURVEY_SAID', question: 1, answer: 'Beta 1', total: 70 });
    fm = go(fm, { type: 'REVEAL_NEXT' }, { type: 'REVEAL_NEXT' });
    expect(fm.events.at(-1)).toMatchObject({
      type: 'SURVEY_SAID',
      question: 2,
      answer: null,
      points: 0,
      total: 70,
    });
  });

  it('Player 1 reveal then hands over to Player 2 with the 25 second clock waiting', () => {
    const fm = atP2Ready();
    expect(fm.phase).toBe('p2-ready');
    expect(FM_P2_MS).toBe(25_000);
    expect(fm.clock).toEqual({ remainingMs: 25_000, running: false });
    expect(go(fm, { type: 'START_CLOCK' }).clock).toEqual({ remainingMs: 25_000, running: true });
  });

  it('reveals are refused when there is nothing to reveal', () => {
    const playing = go(ready(), { type: 'START_CLOCK' });
    expect(reduceFastMoney(playing, { type: 'REVEAL_NEXT' })).toBe(playing);
  });
});

describe('Fast Money 4. Player 2 and the duplicate buzzer', () => {
  const p2Playing = (): FastMoneyState => go(atP2Ready([1, 1, 1, 1, 1]), { type: 'START_CLOCK' });

  it('"Player 2 gets 25 seconds for the same five questions"', () => {
    const fm = p2Playing();
    expect(fm.phase).toBe('p2-playing');
    expect(fm.queue).toEqual([0, 1, 2, 3, 4]);
    expect(fm.clock).toEqual({ remainingMs: 25_000, running: true });
  });

  it('"Repeating Player 1\'s answer ... gets a double buzz and Try again; the clock keeps running": same answer on the survey', () => {
    const fm = p2Playing();
    const duplicate = go(fm, answer(1, 'something else'));
    expect(duplicate.events.at(-1)).toMatchObject({ type: 'DUPLICATE', player: 2, question: 0 });
    expect(duplicate.queue).toEqual([0, 1, 2, 3, 4]);
    expect(duplicate.records.p2[0]).toBeNull();
    expect(duplicate.clock).toEqual({ remainingMs: 25_000, running: true });
    const retry = go(duplicate, answer(2, 'try again'));
    expect(retry.records.p2[0]).toMatchObject({ slot: 2 });
    expect(retry.queue).toEqual([1, 2, 3, 4]);
  });

  it('a repeated answer that is not on the survey is also a duplicate (same words)', () => {
    const base = go(
      ready(),
      { type: 'START_CLOCK' },
      answer(null, 'Purple!'),
      answer(1),
      answer(1),
      answer(1),
      answer(1),
    );
    const fm = go(revealAll(base), { type: 'START_CLOCK' }, answer(null, 'the purple'));
    expect(fm.events.at(-1)?.type).toBe('DUPLICATE');
    expect(fm.records.p2[0]).toBeNull();
  });

  it('"or one in the same survey group": a shared group id is a duplicate', () => {
    const base = go(
      ready(),
      { type: 'START_CLOCK' },
      answer(0, 'colour red', 'colours'),
      answer(1),
      answer(1),
      answer(1),
      answer(1),
    );
    let fm = go(revealAll(base), { type: 'START_CLOCK' });
    expect(fm.phase).toBe('p2-playing');
    const dup = go(fm, answer(null, 'crimson', 'colours'));
    expect(dup.events.at(-1)?.type).toBe('DUPLICATE');
    fm = go(fm, answer(null, 'crimson', 'other'));
    expect(fm.records.p2[0]?.group).toBe('other');
  });

  it('two off-survey answers that differ are not duplicates, and a different question never clashes', () => {
    const base = go(
      ready(),
      { type: 'START_CLOCK' },
      answer(null, 'foo'),
      answer(0),
      answer(0),
      answer(0),
      answer(0),
    );
    const fm = go(revealAll(base), { type: 'START_CLOCK' }, answer(null, 'bar'));
    expect(fm.records.p2[0]?.text).toBe('bar');
    // Player 1 said slot 0 on question 1 too, so only a different slot is accepted there.
    expect(go(fm, answer(0, 'on another question')).events.at(-1)?.type).toBe('DUPLICATE');
    expect(go(fm, answer(2, 'on another question')).records.p2[1]?.slot).toBe(2);
  });

  it('a duplicate is not possible against a question Player 1 passed', () => {
    const base = go(
      ready(),
      { type: 'START_CLOCK' },
      { type: 'PASS' },
      answer(0),
      answer(0),
      answer(0),
      answer(0),
      { type: 'TICK', ms: 20_000 },
    );
    const fm = go(revealAll(base), { type: 'START_CLOCK' }, answer(0));
    // Player 1 passed question 0 (it was never answered), so Player 2 may say anything there.
    expect(fm.records.p1[0]).toBeNull();
    expect(fm.records.p2[0]).toMatchObject({ slot: 0 });
    expect(fm.queue).toEqual([1, 2, 3, 4]);
  });

  it('a duplicate never ends the turn or costs a pass', () => {
    let fm = p2Playing();
    for (let i = 0; i < 6; i += 1) fm = go(fm, answer(1, `again ${i}`));
    expect(fm.phase).toBe('p2-playing');
    expect(fm.queue).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('Fast Money 5. 200 points', () => {
  const runPlayer2 = (fm: FastMoneyState, slots: (number | null)[]): FastMoneyState =>
    revealAll(
      go(go(fm, { type: 'START_CLOCK' }), ...slots.map((slot, index) => answer(slot, `p2 q${index}`))),
    );

  it('"A combined 200 points wins the jackpot"', () => {
    // Player 1: 30 x 5 = 150. Player 2: 20 x 3 + 10 + 0 = 70. 220 in all.
    const done = runPlayer2(atP2Ready([1, 1, 1, 1, 1]), [2, 2, 2, 3, null]);
    expect(done.phase).toBe('done');
    expect(fastMoneyTotal(done)).toBe(220);
    expect(done.outcome).toBe('jackpot');
    expect(done.events.at(-1)).toMatchObject({ type: 'FAST_MONEY_DONE', total: 220, won: true });
  });

  it('exactly 200 wins', () => {
    const done = runPlayer2(atP2Ready([1, 1, 1, 1, 1]), [0, 3, null, null, null]);
    expect(fastMoneyTotal(done)).toBe(200);
    expect(done.outcome).toBe('jackpot');
  });

  it('"Otherwise the family earns the per-point consolation": under 200 is a consolation with the points kept', () => {
    const done = runPlayer2(atP2Ready([1, 1, 1, 1, 1]), [3, 3, null, null, null]);
    expect(done.phase).toBe('done');
    expect(done.outcome).toBe('consolation');
    expect(fastMoneyTotal(done)).toBe(150 + 20);
  });

  it('"If Player 1 alone reaches 200, Player 2 does not need to play"', () => {
    // Five answers worth 50 each: 250.
    const fm = revealAll(p1Answers([0, 0, 0, 0, 0], 50));
    expect(fm.phase).toBe('done');
    expect(fm.outcome).toBe('jackpot');
    expect(fastMoneyTotal(fm)).toBe(250);
    expect(fm.records.p2.every((record) => record === null)).toBe(true);
    expect(reduceFastMoney(fm, { type: 'START_CLOCK' })).toBe(fm);
  });

  it('Player 1 with 190 still hands over to Player 2', () => {
    const fm = revealAll(p1Answers([0, 0, 0, 0, 3], 45));
    expect(shownPoints(fm, 1)).toBe(45 * 4 + 10);
    expect(fm.phase).toBe('p2-ready');
  });

  it('time running out for Player 2 goes to the reveal with what was answered', () => {
    const fm = go(atP2Ready(), { type: 'START_CLOCK' }, answer(2, 'x'), { type: 'TICK', ms: 25_000 });
    expect(fm.phase).toBe('p2-reveal');
    expect(fm.records.p2[0]?.slot).toBe(2);
  });
});

describe('Fast Money 6. Scoring and corrections', () => {
  it('"Answers not on the survey, and passes, score 0"', () => {
    const fm = revealAll(p1Answers([null, null, null, null, null]));
    expect(fastMoneyTotal(fm)).toBe(0);
    const passed = revealAll(go(ready(), { type: 'START_CLOCK' }, { type: 'TICK', ms: 20_000 }));
    expect(fastMoneyTotal(passed)).toBe(0);
  });

  it('"A player\'s first distinct answer is the one that counts": a duplicate is not recorded, the retry is', () => {
    let fm = go(atP2Ready([1, 1, 1, 1, 1]), { type: 'START_CLOCK' });
    fm = go(fm, answer(1, 'same'), answer(0, 'different'));
    expect(fm.records.p2[0]).toMatchObject({ text: 'different', slot: 0 });
  });

  it('"the host can correct a ruling": HOST_SET_MATCH changes the points', () => {
    const fm = p1Answers([null, 1, 1, 1, 1]);
    const fixed = go(fm, { type: 'HOST_SET_MATCH', player: 1, question: 0, slot: 0 });
    expect(fixed.records.p1[0]?.slot).toBe(0);
    expect(fixed.records.p1[0]?.text).toBe('p1 q0');
    expect(fixed.events.at(-1)).toMatchObject({ type: 'MATCH_SET', player: 1, question: 0, slot: 0 });
    const total = fastMoneyTotal(revealAll(fixed));
    expect(total).toBe(40 + 30 * 4);
  });

  it('corrections can take points away and are idempotent', () => {
    const fm = p1Answers([0, 1, 1, 1, 1]);
    const zero = go(fm, { type: 'HOST_SET_MATCH', player: 1, question: 0, slot: null });
    expect(zero.records.p1[0]?.slot).toBeNull();
    expect(reduceFastMoney(zero, { type: 'HOST_SET_MATCH', player: 1, question: 0, slot: null })).toBe(zero);
  });

  it('corrections need an answer to correct and a slot on the survey', () => {
    const fm = go(ready(), { type: 'START_CLOCK' }, { type: 'PASS' }, answer(0));
    expect(reduceFastMoney(fm, { type: 'HOST_SET_MATCH', player: 1, question: 0, slot: 1 })).toBe(fm);
    const answered = p1Answers([0, 0, 0, 0, 0]);
    expect(reduceFastMoney(answered, { type: 'HOST_SET_MATCH', player: 1, question: 0, slot: 9 })).toBe(
      answered,
    );
    expect(reduceFastMoney(answered, { type: 'HOST_SET_MATCH', player: 1, question: 7, slot: 1 })).toBe(
      answered,
    );
  });

  it('"A correction can never let Player 2 score Player 1\'s answer to the same question"', () => {
    const fm = go(atP2Ready([1, 1, 1, 1, 1]), { type: 'START_CLOCK' }, answer(null, 'p2 guess'));
    // Player 1 holds slot 1 on question 0; giving it to Player 2 is refused.
    expect(reduceFastMoney(fm, { type: 'HOST_SET_MATCH', player: 2, question: 0, slot: 1 })).toBe(fm);
    // Another slot is fine.
    expect(go(fm, { type: 'HOST_SET_MATCH', player: 2, question: 0, slot: 2 }).records.p2[0]?.slot).toBe(2);
  });

  it('"to give Player 1 an answer Player 2 holds, Player 2\'s answer is ruled off the survey first"', () => {
    const base = go(
      ready(),
      { type: 'START_CLOCK' },
      answer(null, 'p1 guess'),
      answer(1),
      answer(1),
      answer(1),
      answer(1),
    );
    const p2 = go(revealAll(base), { type: 'START_CLOCK' }, answer(2, 'p2 hit'));
    const fixed = go(p2, { type: 'HOST_SET_MATCH', player: 1, question: 0, slot: 2 });
    expect(fixed.records.p1[0]?.slot).toBe(2);
    expect(fixed.records.p2[0]).toMatchObject({ text: 'p2 hit', slot: null });
    expect(eventTypes(fixed).slice(-2)).toEqual(['RULED_OFF', 'MATCH_SET']);
    expect(fixed.events.at(-2)).toMatchObject({ type: 'RULED_OFF', player: 2, question: 0 });
  });

  it('the same rule holds for survey groups', () => {
    const base = go(
      ready(),
      { type: 'START_CLOCK' },
      answer(null, 'p1 guess'),
      answer(1),
      answer(1),
      answer(1),
      answer(1),
    );
    const p2 = go(revealAll(base), { type: 'START_CLOCK' }, answer(null, 'p2 guess', 'g'));
    const fixed = go(p2, { type: 'HOST_SET_MATCH', player: 1, question: 0, slot: null, group: 'g' });
    expect(fixed.records.p1[0]?.group).toBe('g');
    expect(fixed.events.some((event) => event.type === 'RULED_OFF')).toBe(true);
    expect(fixed.records.p2[0]?.group).toBeUndefined();
    // And Player 2 cannot be moved into Player 1's group.
    expect(
      reduceFastMoney(fixed, { type: 'HOST_SET_MATCH', player: 2, question: 0, slot: null, group: 'g' }),
    ).toBe(fixed);
  });

  it('corrections are refused once Fast Money is done', () => {
    const done = go(atP2Ready(), { type: 'END_EARLY' });
    expect(reduceFastMoney(done, { type: 'HOST_SET_MATCH', player: 1, question: 0, slot: 0 })).toBe(done);
  });
});

describe('Fast Money 7. Ending early', () => {
  it('"If the host ends Fast Money early, the points already shown in the total count": unrevealed points do not', () => {
    // 6 of 11 steps: three "Survey said" steps have happened for slots 0, 0, 0 = 120 points shown.
    let fm = p1Answers([0, 0, 0, 0, 0]);
    for (let i = 0; i < 6; i += 1) fm = go(fm, { type: 'REVEAL_NEXT' });
    const ended = go(fm, { type: 'END_EARLY' });
    expect(ended.phase).toBe('done');
    expect(ended.endedEarly).toBe(true);
    expect(fastMoneyTotal(ended)).toBe(120);
  });

  it('"and it is a win only if they reached 200": below 200 is not a win', () => {
    let fm = p1Answers([0, 0, 0, 0, 0]);
    for (let i = 0; i < 10; i += 1) fm = go(fm, { type: 'REVEAL_NEXT' });
    expect(fastMoneyTotal(fm)).toBe(200);
    const ended = go(fm, { type: 'END_EARLY' });
    expect(ended.outcome).toBe('jackpot');
    let low = p1Answers([0, 0, 0, 0, 0]);
    for (let i = 0; i < 8; i += 1) low = go(low, { type: 'REVEAL_NEXT' });
    expect(fastMoneyTotal(low)).toBe(160);
    expect(go(low, { type: 'END_EARLY' }).outcome).toBe('consolation');
  });

  it('ending early before anything is shown keeps 0 points', () => {
    const ended = go(p1Answers([0, 0, 0, 0, 0]), { type: 'END_EARLY' });
    expect(fastMoneyTotal(ended)).toBe(0);
    expect(ended.outcome).toBe('consolation');
  });

  it('can be ended from any phase before done, and only once', () => {
    const fresh = createFastMoney({ family: 'A', podiumSize: 5 });
    const ended = go(fresh, { type: 'END_EARLY' });
    expect(ended.phase).toBe('done');
    expect(reduceFastMoney(ended, { type: 'END_EARLY' })).toBe(ended);
  });

  it('a player-1 total shown before Player 2 starts still counts when ended during Player 2', () => {
    const fm = go(atP2Ready([1, 1, 1, 1, 1]), { type: 'START_CLOCK' }, answer(0, 'big'), {
      type: 'END_EARLY',
    });
    expect(fastMoneyTotal(fm)).toBe(150);
  });
});

describe('Fast Money engine contract', () => {
  it('illegal actions return the same reference in every phase', () => {
    const phases: FastMoneyState[] = [
      createFastMoney({ family: 'A', podiumSize: 5 }),
      ready(),
      go(ready(), { type: 'START_CLOCK' }),
      p1Answers([0, 0, 0, 0, 0]),
      atP2Ready(),
      go(atP2Ready(), { type: 'START_CLOCK' }),
      go(atP2Ready(), { type: 'END_EARLY' }),
    ];
    const nonsense: FastMoneyAction[] = [
      { type: 'TICK', ms: Number.NaN },
      { type: 'HOST_SET_MATCH', player: 1, question: 99, slot: 0 },
      { type: 'CHOOSE_PLAYERS', p1: 9, p2: 9 },
      { type: 'PROVIDE_QUESTIONS', questions: [] },
      { type: 'ANSWER', text: '', judged: { slot: null } },
    ];
    for (const fm of phases) {
      for (const action of nonsense) expect(reduceFastMoney(fm, action)).toBe(fm);
    }
  });

  it('events carry a monotonic seq', () => {
    const fm = revealAll(p1Answers([0, 1, 2, 3, null]));
    const seqs = fm.events.map((event) => event.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it('legalFastMoneyActions reflects the phase', () => {
    expect(legalFastMoneyActions(createFastMoney({ family: 'A', podiumSize: 5 }))).toEqual([
      'PROVIDE_QUESTIONS',
      'CHOOSE_PLAYERS',
      'END_EARLY',
    ]);
    expect(legalFastMoneyActions(ready())).toEqual([
      'PROVIDE_QUESTIONS',
      'CHOOSE_PLAYERS',
      'START_CLOCK',
      'END_EARLY',
    ]);
    const playing = legalFastMoneyActions(go(ready(), { type: 'START_CLOCK' }));
    expect(playing).toEqual(expect.arrayContaining(['TICK', 'PAUSE', 'ANSWER', 'PASS', 'END_EARLY']));
    expect(playing).not.toContain('RESUME');
    expect(legalFastMoneyActions(go(atP2Ready(), { type: 'END_EARLY' }))).toEqual([]);
  });
});
