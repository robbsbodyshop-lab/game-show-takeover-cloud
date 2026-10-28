/**
 * Letter classes and validation for the Wheel engine.
 * Rules of record: docs/WHEEL_OF_FORTUNE_RULES.md ("A turn": Y is a consonant).
 */
export const VOWELS: readonly string[] = ['A', 'E', 'I', 'O', 'U'];
export const CONSONANTS: readonly string[] = 'BCDFGHJKLMNPQRSTVWXYZ'.split('');
export const ALPHABET: readonly string[] = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** Given free in the Bonus Round (rules: "R, S, T, L, N and E are revealed"). */
export const BONUS_GIVEN_LETTERS: readonly string[] = ['R', 'S', 'T', 'L', 'N', 'E'];

/** Normalises user input to one upper-case A-Z letter, or null when it is not one. */
export function parseLetter(input: string): string | null {
  const t = input.trim().toUpperCase();
  return /^[A-Z]$/.test(t) ? t : null;
}

export function isVowel(letter: string): boolean {
  return VOWELS.includes(letter);
}

export function isConsonant(letter: string): boolean {
  return CONSONANTS.includes(letter);
}

export function isLetter(char: string): boolean {
  return /^[A-Z]$/.test(char);
}
