import { describe, expect, it } from 'vitest';
import { judgeSolve, levenshtein } from './solve';

describe('judgeSolve', () => {
  const phrase = "DON'T COUNT YOUR CHICKENS";

  it('accepts the same words ignoring case', () => {
    expect(judgeSolve("don't count your chickens", phrase)).toBe('correct');
  });

  it('ignores punctuation and spacing', () => {
    expect(judgeSolve('DONT  COUNT, your chickens!', phrase)).toBe('correct');
    expect(judgeSolve("  Don't   count your  chickens  ", phrase)).toBe('correct');
    expect(judgeSolve('FISH AND CHIPS', 'FISH & CHIPS')).toBe('correct');
    expect(judgeSolve('well deserved day off', 'A WELL-DESERVED DAY OFF')).toBe('close');
    expect(judgeSolve('a well deserved day off', 'A WELL-DESERVED DAY OFF')).toBe('correct');
  });

  it.each(["it's", 'It is', 'The answer is', 'is it', "It's a"])('strips the lead-in "%s"', (lead) => {
    const ans = lead.endsWith(' a') ? `${lead} piece of cake` : `${lead} a piece of cake`;
    expect(judgeSolve(ans, 'A PIECE OF CAKE')).toBe('correct');
  });

  it('strips "it\'s a" in front of a phrase that does not start with an article', () => {
    expect(judgeSolve("It's a Tuesday", 'TUESDAY')).toBe('correct');
    expect(judgeSolve("it's the beach", 'BEACH')).toBe('correct');
  });

  it('does not strip a lead-in that is part of the phrase', () => {
    expect(judgeSolve("it's a wonderful life", "IT'S A WONDERFUL LIFE")).toBe('correct');
    expect(judgeSolve('is it a bird', 'IS IT A BIRD')).toBe('correct');
  });

  it('a missing plural S is close, not correct', () => {
    expect(judgeSolve("don't count your chicken", "DON'T COUNT YOUR CHICKENS")).toBe('close');
    expect(judgeSolve('red apple', 'RED APPLES')).toBe('close');
    expect(judgeSolve('red apples', 'RED APPLE')).toBe('close');
  });

  it('a nearly right answer within Levenshtein distance 2 is close', () => {
    expect(judgeSolve('blue moon rising', 'BLUE MOON RISING')).toBe('correct');
    expect(judgeSolve('blue mon rising', 'BLUE MOON RISING')).toBe('close');
    expect(judgeSolve('blu mon rising', 'BLUE MOON RISING')).toBe('close');
  });

  it('a single word one letter off is close', () => {
    expect(judgeSolve('paper lantarn', 'PAPER LANTERN')).toBe('close');
  });

  it('words dropped or added are wrong when more than two letters differ', () => {
    expect(judgeSolve('blue moon', 'BLUE MOON RISING')).toBe('wrong');
    expect(judgeSolve('blue moon is rising fast', 'BLUE MOON RISING')).toBe('wrong');
  });

  it('a different answer is wrong', () => {
    expect(judgeSolve('garden party', 'SILVER SPOON')).toBe('wrong');
  });

  it('an empty answer is wrong', () => {
    expect(judgeSolve('', 'SILVER SPOON')).toBe('wrong');
    expect(judgeSolve('   ', 'SILVER SPOON')).toBe('wrong');
    expect(judgeSolve("it's", 'SILVER SPOON')).toBe('wrong');
  });

  it('curly apostrophes count as apostrophes', () => {
    expect(judgeSolve('don’t count your chickens', phrase)).toBe('correct');
  });
});

describe('levenshtein', () => {
  it('measures edits', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('same', 'same')).toBe(0);
    expect(levenshtein('cat', 'cats')).toBe(1);
  });
});
