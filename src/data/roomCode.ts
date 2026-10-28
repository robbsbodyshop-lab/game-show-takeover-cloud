/** Room codes: 4 letters from 20 consonants (160,000 codes). Mirrors the CHECK constraint in 0001_init.sql. */
export const ROOM_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';
export const ROOM_CODE_LENGTH = 4;
export const ROOM_CODE_PATTERN = /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/;

export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase();
}

export function isValidRoomCode(code: string): boolean {
  return ROOM_CODE_PATTERN.test(code);
}

/** `random` returns a float in [0, 1); injected so tests are deterministic. */
export function generateRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    const index = Math.min(ROOM_CODE_ALPHABET.length - 1, Math.floor(random() * ROOM_CODE_ALPHABET.length));
    code += ROOM_CODE_ALPHABET.charAt(index);
  }
  return code;
}
