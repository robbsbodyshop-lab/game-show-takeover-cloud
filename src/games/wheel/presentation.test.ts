import { describe, expect, it } from 'vitest';
import { toRound } from '@/engines/wheel/testKit';
import type { WheelState } from '@/engines/wheel/types';
import { continueLabel, vowelNotice } from './presentation';

describe('continueLabel', () => {
  const award = (round: 1 | 2 | 3 | 4): WheelState => ({ ...toRound(round), phase: 'round-award' });

  it('names the way on after each round', () => {
    expect(continueLabel(award(1))).toBe('On to Round 2');
    expect(continueLabel(award(2))).toBe('On to Round 3: the Prize Puzzle');
    expect(continueLabel(award(3))).toBe('On to the Triple Toss-Up');
  });

  it('is empty while a round is in play and names the Bonus and winner steps', () => {
    expect(continueLabel(toRound(1))).toBeNull();
    expect(continueLabel({ ...toRound(1), phase: 'bonus-ready' })).toBe('Start the 10 second clock');
    expect(continueLabel({ ...toRound(1), phase: 'bonus-opened' })).toBe('Final results');
    expect(continueLabel({ ...toRound(1), phase: 'done' })).toBe('Continue to the hub');
  });

  it('moves a Triple Toss-Up on to its next puzzle before the next segment', () => {
    const base = toRound(1);
    const triple: WheelState = {
      ...base,
      stage: 'triple',
      phase: 'tossup-done',
      planIndex: base.plan.findIndex((seg) => seg.kind === 'triple'),
      triple: { index: 0, solvers: [null, null, null], sweep: 4000, value: 2000 },
    };
    expect(continueLabel(triple)).toBe('Next puzzle');
    expect(
      continueLabel({
        ...triple,
        triple: { index: 2, solvers: [null, null, null], sweep: 4000, value: 2000 },
      }),
    ).toBe('On to Round 4');
  });
});

describe('vowelNotice', () => {
  const base = toRound(1);
  const called = (letters: string[]): WheelState =>
    base.puzzle ? { ...base, puzzle: { ...base.puzzle, called: letters } } : base;
  it('flags only vowels and no more vowels, never a letter', () => {
    expect(vowelNotice(called(['R', 'D', 'P', 'L']))).toBe('ONLY VOWELS REMAIN');
    expect(vowelNotice(called(['A', 'E', 'I']))).toBe('NO MORE VOWELS');
    expect(vowelNotice(called(['R']))).toBeNull();
    expect(vowelNotice(base)).toBeNull();
  });
});
