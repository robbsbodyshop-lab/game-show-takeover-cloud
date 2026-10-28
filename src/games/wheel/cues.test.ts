import { describe, expect, it } from 'vitest';
import { toRound } from '@/engines/wheel/testKit';
import type { WheelEvent, WheelEventType, WheelState } from '@/engines/wheel/types';
import { cuesFor, vowelNoticeCue } from './cues';
import * as C from './cues';

const ev = (type: WheelEventType, extra: Partial<WheelEvent> = {}): WheelEvent => ({
  seq: 1,
  type,
  ...extra,
});
const names = (events: WheelEvent[], state: WheelState = toRound(1)) =>
  cuesFor(events, state).map((c) => c.cue);

describe('cuesFor (AUDIO_CUES_V1.md)', () => {
  it('maps the immediate cues of the table', () => {
    expect(names([ev('buzz')])).toEqual(['wof_ring_in']);
    expect(names([ev('tossup-wrong')])).toEqual(['wheel_buzzer']);
    expect(names([ev('letter-miss')])).toEqual(['wheel_buzzer']);
    expect(names([ev('letter-repeat')])).toEqual(['wheel_buzzer']);
    expect(names([ev('time-out')])).toEqual(['wheel_buzzer']);
    expect(names([ev('solve-wrong')])).toEqual(['wheel_buzzer']);
    expect(names([ev('lose-turn')])).toEqual(['wof_lose_turn']);
    expect(names([ev('vowel-bought')])).toEqual(['vowel']);
    expect(names([ev('bell')])).toEqual(['wof_time_bell']);
    expect(names([ev('tossup-filled')])).toEqual(['wof_time_up']);
    expect(names([ev('bonus-time-up')])).toEqual(['wof_time_up']);
    expect(names([ev('spin', { label: 'mystery' })])).toEqual(['wof_mystery']);
    expect(names([ev('spin', { label: 'express' })])).toEqual(['wof_express']);
    expect(names([ev('spin', { label: 'cash' })])).toEqual([]);
    expect(names([ev('round-solved')])).toEqual(['wof_solve']);
    expect(names([ev('bonus-solved')])).toEqual(['wof_solve']);
  });

  it('chooses the toss-up solve sound by stage', () => {
    const triple = {
      ...toRound(1),
      stage: 'triple' as const,
      triple: { index: 0, solvers: [null, null, null], sweep: 4000, value: 2000 },
    };
    expect(names([ev('tossup-correct')], triple)).toEqual(['wof_triple_ding']);
    expect(names([ev('tossup-correct')], { ...triple, triple: { ...triple.triple, index: 2 } })).toEqual([
      'wof_tossup_solve',
    ]);
    expect(names([ev('tossup-correct')], { ...toRound(1), stage: 'frenzy' })).toEqual(['wof_triple_ding']);
    expect(names([ev('tossup-correct')], { ...toRound(1), stage: 'tossup' })).toEqual(['wof_tossup_solve']);
  });

  it('uses the prize chime for the Prize Puzzle and the category chime elsewhere', () => {
    expect(names([ev('puzzle')], toRound(1))).toEqual(['wof_category_chime']);
    expect(names([ev('puzzle')], toRound(3))).toEqual(['wof_prize_chime']);
  });

  it('delays the cues the doc says wait a beat', () => {
    const delay = (events: WheelEvent[], state?: WheelState) =>
      cuesFor(events, state ?? toRound(1)).map((c) => [c.cue, c.delayMs]);
    expect(delay([ev('sweep')])).toEqual([['applause', C.APPLAUSE_DELAY_MS]]);
    expect(delay([ev('same-letter')])).toEqual([['wheel_letter_ding', C.SAME_LETTER_DELAY_MS]]);
    expect(delay([ev('wild-card-claimed')])).toEqual([['wof_wild_card', C.STING_DELAY_MS]]);
    expect(delay([ev('million-claimed')])).toEqual([['wof_million', C.STING_DELAY_MS]]);
    expect(delay([ev('game-over')])).toEqual([['winner_fanfare', C.GAME_OVER_DELAY_MS]]);
    expect(delay([ev('round-solved')], toRound(3))).toEqual([
      ['wof_solve', 0],
      ['applause', C.APPLAUSE_DELAY_MS],
    ]);
  });

  it('plays Bankrupt at once after a spin, after the buzzer on a failed Express, after the roll on a Mystery flip', () => {
    const delayOf = (events: WheelEvent[]) =>
      cuesFor(events, toRound(1)).find((c) => c.cue === 'wof_bankrupt')?.delayMs;
    expect(delayOf([ev('spin'), ev('bankrupt')])).toBe(0);
    expect(delayOf([ev('letter-miss'), ev('bankrupt')])).toBe(C.BANKRUPT_AFTER_BUZZER_MS);
    expect(delayOf([ev('solve-wrong'), ev('bankrupt')])).toBe(C.BANKRUPT_AFTER_BUZZER_MS);
    expect(delayOf([ev('mystery-flip', { amount: 0 }), ev('bankrupt')])).toBe(C.BANKRUPT_AFTER_ROLL_MS);
  });

  it('a Mystery flip to $10,000 rolls then applauds; a vowel that misses buzzes after its blip', () => {
    expect(
      cuesFor([ev('mystery-flip', { amount: 10000 })], toRound(2)).map((c) => [c.cue, c.delayMs]),
    ).toEqual([
      ['wof_mystery_flip', 0],
      ['applause', C.BANKRUPT_AFTER_ROLL_MS],
    ]);
    expect(
      cuesFor([ev('vowel-bought'), ev('letter-miss')], toRound(1)).map((c) => [c.cue, c.delayMs]),
    ).toEqual([
      ['vowel', 0],
      ['wheel_buzzer', C.BUZZER_AFTER_VOWEL_MS],
    ]);
  });

  it('starts the final spin 1.6 s after the bell when both come together', () => {
    expect(cuesFor([ev('bell'), ev('speedup')], toRound(4)).map((c) => [c.cue, c.delayMs])).toEqual([
      ['wof_time_bell', 0],
      ['wof_final_spin', C.FINAL_SPIN_AFTER_BELL_MS],
    ]);
    expect(cuesFor([ev('segment', { label: 'speedup' })], toRound(4)).map((c) => c.cue)).toEqual([
      'wof_final_spin',
    ]);
  });

  it('plays the envelope win or lose cue from the Bonus outcome', () => {
    const won = { ...toRound(1), bonus: { won: true } as WheelState['bonus'] };
    const lost = { ...toRound(1), bonus: { won: false } as WheelState['bonus'] };
    expect(names([ev('bonus-opened')], won)).toEqual(['wof_bonus_win']);
    expect(names([ev('bonus-opened')], lost)).toEqual(['wof_bonus_lose']);
  });

  it('says nothing for events that only move the engine', () => {
    for (const t of [
      'turn',
      'segment',
      'undo',
      'puzzle-thrown-out',
      'bank-adjusted',
      'consolation',
      'letters-lit',
    ] as const)
      expect(names([ev(t)])).toEqual([]);
  });
});

describe('vowelNoticeCue', () => {
  const base = toRound(1);
  const puzzleWith = (called: string[]): WheelState =>
    base.puzzle ? { ...base, puzzle: { ...base.puzzle, called } } : base;
  it('announces when the last vowel is called and when only vowels remain', () => {
    // RED APPLE PIE has vowels A, E, I and consonants R D P L.
    expect(vowelNoticeCue(puzzleWith(['A', 'E']), puzzleWith(['A', 'E', 'I']))?.cue).toBe(
      'wof_no_more_vowels',
    );
    expect(vowelNoticeCue(puzzleWith(['R', 'D', 'P']), puzzleWith(['R', 'D', 'P', 'L']))?.cue).toBe(
      'wof_only_vowels',
    );
    expect(vowelNoticeCue(puzzleWith([]), puzzleWith(['R']))).toBeNull();
  });
});
