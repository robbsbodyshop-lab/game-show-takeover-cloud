import { describe, expect, it } from 'vitest';
import {
  ALPHABET,
  BONUS_GIVEN_LETTERS,
  CONSONANTS,
  VOWELS,
  isConsonant,
  isVowel,
  parseLetter,
} from './letters';

describe('letters', () => {
  it('Y is a consonant', () => {
    expect(isConsonant('Y')).toBe(true);
    expect(isVowel('Y')).toBe(false);
  });

  it('the alphabet is five vowels and 21 consonants', () => {
    expect(VOWELS).toHaveLength(5);
    expect(CONSONANTS).toHaveLength(21);
    expect([...VOWELS, ...CONSONANTS].sort()).toEqual([...ALPHABET]);
  });

  it('RSTLNE are the free Bonus letters', () => {
    expect([...BONUS_GIVEN_LETTERS].sort()).toEqual(['E', 'L', 'N', 'R', 'S', 'T']);
  });

  it('parseLetter normalises one A-Z letter and rejects anything else', () => {
    expect(parseLetter('q')).toBe('Q');
    expect(parseLetter(' b ')).toBe('B');
    expect(parseLetter('')).toBeNull();
    expect(parseLetter('AB')).toBeNull();
    expect(parseLetter('1')).toBeNull();
    expect(parseLetter('é')).toBeNull();
  });
});
