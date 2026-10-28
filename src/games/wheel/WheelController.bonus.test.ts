import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { autoplay, newGame, run } from '@/engines/wheel/testKit';
import type { WheelState } from '@/engines/wheel/types';
import { makeHarness } from './controllerHarness';
import type { Harness } from './controllerHarness';
import { BONUS_CLOCK_MS, ENVELOPE_SUSPENSE_MS } from './WheelController';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(3_000_000);
});
afterEach(() => {
  vi.useRealTimers();
});

/** The main game is done and the Bonus Round is asking for its three puzzles. */
function bonusRequest(): WheelState {
  let s = autoplay(
    newGame({ length: 'short' }),
    (st) => st.phase === 'round-award' && st.award?.speedUp === true,
  );
  s = run(s, { type: 'ADJUST_BANK', team: 1, delta: 9000 }, { type: 'CONTINUE' });
  expect(s.stage).toBe('bonus');
  expect(s.request).toEqual({ use: 'bonus', count: 3 });
  return s;
}

const wait = (h: Harness, ms: number) => {
  h.advance(ms);
};

function toBonusLetters(): Harness {
  const h = makeHarness({ initialState: bonusRequest() });
  const category = h.host.data.bonus?.categories[0] ?? '';
  expect(h.host.send('bonus-category', { category }).applied).toBe(true);
  h.queueDraws(0.5);
  expect(h.controller.run('spin').applied).toBe(true);
  wait(h, 5100);
  return h;
}

/** Calls three consonants and a vowel, using letters that are in the puzzle where there are any. */
function callAll(h: Harness): void {
  const phrase = h.engine().puzzle?.puzzle.phrase ?? '';
  const free = 'RSTLNE'.split('');
  const inPuzzle = [...new Set(phrase.replace(/[^A-Z]/g, '').split(''))].filter((l) => !free.includes(l));
  const consonants = inPuzzle.filter((l) => !'AEIOU'.includes(l));
  const vowels = inPuzzle.filter((l) => 'AEIOU'.includes(l));
  const spare = 'BCDFGHJKMPQVWXYZ'.split('').filter((l) => !phrase.includes(l) && !consonants.includes(l));
  const picks = [...consonants.slice(0, 3)];
  while (picks.length < 3) picks.push(spare.shift() ?? 'Z');
  picks.push(vowels[0] ?? 'AIOU'.split('').find((l) => !phrase.includes(l)) ?? 'U');
  for (const l of picks) {
    wait(h, 600);
    h.controller.run('letter', { letter: l });
  }
}

describe('the Bonus Round', () => {
  it('offers three categories from content and keeps the envelope sealed from the audience', () => {
    const h = makeHarness({ initialState: bonusRequest() });
    const view = h.controller.getSnapshot().view;
    expect(view.bonus?.categories).toHaveLength(3);
    expect(new Set(view.bonus?.categories).size).toBe(3);
    expect(h.engine().phase).toBe('bonus-category');
  });

  it('holds the Bonus Wheel result for its 5 s spin and chimes when it stops', () => {
    const h = makeHarness({ initialState: bonusRequest() });
    const category = h.host.data.bonus?.categories[1] ?? '';
    h.host.send('bonus-category', { category });
    expect(h.engine().bonus?.category).toBe(category);
    expect(h.audio.played('wof_category_chime')).toBeGreaterThanOrEqual(1);
    h.queueDraws(0.37);
    h.controller.run('spin');
    expect(h.audio.played('wof_bonus_spin')).toBe(1);
    expect(h.controller.getSnapshot().spinning).toBe(true);
    expect(h.controller.getSnapshot().spinKind).toBe('bonus');
    expect(h.controller.getSnapshot().view.called).toEqual([]);
    wait(h, 4900);
    expect(h.audio.played('wof_bonus_chime')).toBe(0);
    wait(h, 300);
    expect(h.audio.played('wof_bonus_chime')).toBe(1);
    expect(h.controller.getSnapshot().view.called.length).toBeGreaterThan(0);
    expect(h.controller.getSnapshot().bonusDeg).toBeCloseTo((360 - 0.37 * 360) % 360, 5);
    const envelope = h.host.data.envelope;
    expect(envelope).not.toBeNull();
    expect(JSON.stringify(h.controller.getSnapshot())).not.toContain(String(envelope?.value));
  });

  it('runs the 10 s clock with its bed and ends on time up, then the envelope opens after 3 s of suspense', () => {
    const h = toBonusLetters();
    callAll(h);
    expect(h.engine().phase).toBe('bonus-ready');
    wait(h, 600);
    expect(h.host.send('continue').applied).toBe(true);
    expect(h.engine().phase).toBe('bonus-solving');
    expect(h.audio.bed).toHaveBeenCalledWith('wof_bonus_clock_10');
    expect(h.controller.getSnapshot().clock).toMatchObject({ kind: 'bonus', totalMs: BONUS_CLOCK_MS });

    wait(h, BONUS_CLOCK_MS - 100);
    expect(h.engine().phase).toBe('bonus-solving');
    wait(h, 200);
    expect(h.engine().phase).toBe('bonus-timeup');
    expect(h.audio.stop).toHaveBeenCalledWith('wof_bonus_clock_10');
    expect(h.audio.played('wof_time_up')).toBeGreaterThanOrEqual(1);

    // The suspense runs 3 s, holds with the game, then the envelope opens (a miss here).
    expect(h.host.send('open-envelope').applied).toBe(true);
    expect(h.audio.bed).toHaveBeenCalledWith('wof_envelope');
    expect(h.controller.getSnapshot().envelopeOpening).toBe(true);
    wait(h, 1000);
    h.controller.setInputLocked(true);
    wait(h, 60_000);
    expect(h.engine().bonus?.opened).toBe(false);
    h.controller.setInputLocked(false);
    wait(h, ENVELOPE_SUSPENSE_MS - 1000 - 100);
    expect(h.engine().bonus?.opened).toBe(false);
    wait(h, 200);
    expect(h.engine().bonus?.opened).toBe(true);
    expect(h.audio.played('wof_bonus_lose')).toBe(1);
    expect(h.controller.getSnapshot().view.bonus?.prize).not.toBeNull();
    expect(h.controller.getSnapshot().envelopeOpening).toBe(false);
  });

  it('a right answer before the clock wins; the win cue plays when the envelope opens', () => {
    const h = toBonusLetters();
    const phrase = h.engine().puzzle?.puzzle.phrase ?? '';
    expect(h.phones.action(1, 'solve', phrase.toLowerCase())).toBe(true);
    expect(h.engine().phase).toBe('bonus-won');
    expect(h.engine().bonus?.won).toBe(true);
    wait(h, 600);
    h.host.send('open-envelope');
    wait(h, ENVELOPE_SUSPENSE_MS + 100);
    expect(h.audio.played('wof_bonus_win')).toBe(1);
    expect(h.audio.played('wof_bonus_lose')).toBe(0);
  });

  it('reports a Bonus win as a bonus chip when the host continues from the winner card', () => {
    const h = toBonusLetters();
    h.phones.action(1, 'solve', h.engine().puzzle?.puzzle.phrase ?? '');
    wait(h, 600);
    h.host.send('open-envelope');
    wait(h, ENVELOPE_SUSPENSE_MS + 100);
    expect(h.host.send('continue').applied).toBe(true);
    expect(h.engine().stage).toBe('game-over');
    wait(h, 600);
    expect(h.host.send('continue').applied).toBe(true);
    expect(h.ended).toHaveLength(1);
    expect(h.ended[0]).toMatchObject({ winnerId: 1, bonusChips: 1 });
  });
});
