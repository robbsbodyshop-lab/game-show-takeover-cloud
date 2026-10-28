import { describe, expect, it } from 'vitest';
import {
  ROOM_CODE_ALPHABET,
  generateRoomCode,
  isRoomCode,
  normalizeRoomCode,
  parseTopic,
  topicFor,
} from './roomCodes';

describe('ROOM_CODE_ALPHABET', () => {
  it('is the 20 consonants without vowels or Y', () => {
    expect(ROOM_CODE_ALPHABET).toBe('BCDFGHJKLMNPQRSTVWXZ');
    expect(ROOM_CODE_ALPHABET).toHaveLength(20);
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[AEIOUY]/);
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(20);
  });
});

describe('generateRoomCode', () => {
  it('maps rng output to alphabet positions', () => {
    const values = [0, 0.05, 0.5, 0.999];
    let i = 0;
    const code = generateRoomCode(() => values[i++] ?? 0);
    expect(code).toBe('BCNZ');
  });

  it('clamps an rng that returns exactly 1', () => {
    expect(generateRoomCode(() => 1)).toBe('ZZZZ');
  });

  it('always yields valid codes for a stream of random values', () => {
    for (let n = 0; n < 500; n++) expect(isRoomCode(generateRoomCode(Math.random))).toBe(true);
  });
});

describe('isRoomCode', () => {
  it.each([
    ['BCDF', true],
    ['ZXWV', true],
    ['bcdf', false],
    ['BCD', false],
    ['BCDFG', false],
    ['ABCD', false], // vowel
    ['BC1D', false],
    ['BCD ', false],
    ['', false],
  ])('%j -> %s', (input, expected) => {
    expect(isRoomCode(input)).toBe(expected);
  });

  it('rejects non-strings', () => {
    expect(isRoomCode(undefined)).toBe(false);
    expect(isRoomCode(1234)).toBe(false);
    expect(isRoomCode(null)).toBe(false);
  });
});

describe('normalizeRoomCode', () => {
  it('uppercases and removes whitespace', () => {
    expect(normalizeRoomCode(' bk dx\n')).toBe('BKDX');
  });
});

describe('topicFor / parseTopic', () => {
  it('builds the three topics', () => {
    expect(topicFor('BKDX', 'stage')).toBe('room:BKDX:stage');
    expect(topicFor('BKDX', 'phones')).toBe('room:BKDX:phones');
    expect(topicFor('BKDX', 'host')).toBe('room:BKDX:host');
  });

  it('refuses a code that could forge another topic', () => {
    expect(() => topicFor('BK:DX', 'stage')).toThrow(RangeError);
    expect(() => topicFor('', 'stage')).toThrow(RangeError);
    expect(() => topicFor('bkdx', 'stage')).toThrow(RangeError);
  });

  it('round-trips', () => {
    expect(parseTopic(topicFor('BKDX', 'phones'))).toEqual({ code: 'BKDX', kind: 'phones' });
  });

  it.each([
    '',
    'room:BKDX',
    'room:BKDX:other',
    'chat:BKDX:stage',
    'room:BKDX:stage:x',
    'room::stage',
    'room:bkdx:host',
  ])('rejects %j', (topic) => {
    expect(parseTopic(topic)).toBeNull();
  });
});
