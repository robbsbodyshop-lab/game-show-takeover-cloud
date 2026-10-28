import { describe, expect, it } from 'vitest';
import feudJson from './family_feud.json';
import wheelJson from './wheel_of_fortune.json';
import { validateContent } from './index.ts';
import {
  WHEEL_BONUS_CATEGORIES,
  WHEEL_CATEGORIES,
  feudFileSchema,
  joinLines,
  validateContentFiles,
  wheelFileSchema,
} from './schema.ts';
import type { FeudFile, WheelFile } from './types.ts';

const feud = feudJson as unknown as FeudFile;
const wheel = wheelJson as unknown as WheelFile;

describe('bundled content', () => {
  it('has the documented counts', () => {
    expect(feud.surveys).toHaveLength(115);
    expect(feud.fastMoney).toHaveLength(79);
    expect(wheel.puzzles).toHaveLength(331);
    const count = (use: string): number => wheel.puzzles.filter((p) => p.use.includes(use as never)).length;
    expect(count('round')).toBe(138);
    expect(count('prize')).toBe(18);
    expect(count('tossup')).toBe(70);
    expect(count('triple')).toBe(42);
    expect(count('tiebreak')).toBe(10);
    expect(count('bonus')).toBe(63);
  });

  it('has 14 triple sets of three and 10 toss-ups in each of seven categories', () => {
    const sets = new Map<string, number>();
    for (const p of wheel.puzzles) if (p.set) sets.set(p.set, (sets.get(p.set) ?? 0) + 1);
    expect(sets.size).toBe(14);
    expect([...sets.values()].every((n) => n === 3)).toBe(true);
    const cats = new Map<string, number>();
    for (const p of wheel.puzzles)
      if (p.use.includes('tossup')) cats.set(p.category, (cats.get(p.category) ?? 0) + 1);
    expect(cats.size).toBe(7);
    expect([...cats.values()].every((n) => n === 10)).toBe(true);
  });

  it('passes the whole validation', () => {
    expect(validateContent()).toEqual({ ok: true, problems: [] });
  });

  it('uses only registered categories, and every bonus category is registered', () => {
    const used = new Set(wheel.puzzles.map((p) => p.category));
    expect([...used].every((c) => (WHEEL_CATEGORIES as readonly string[]).includes(c))).toBe(true);
    expect([...WHEEL_CATEGORIES].every((c) => used.has(c))).toBe(true);
    for (const c of WHEEL_BONUS_CATEGORIES) expect(WHEEL_CATEGORIES).toContain(c);
  });
});

// --- crafted fixtures ----------------------------------------------------------------------------

const clone = <T>(v: T): T => structuredClone(v);
const answers = (...points: number[]): { answer: string; points: number }[] =>
  points.map((p, i) => ({ answer: `ANSWER ${String.fromCharCode(65 + i)}`, points: p }));

const survey = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'fx-1',
  question: 'Name something.',
  answers: answers(30, 25, 20, 10),
  ...over,
});

/** Validate a feud file whose first survey / fast money question is replaced. */
const feudProblems = (s: Record<string, unknown>, where: 'surveys' | 'fastMoney' = 'surveys'): string[] => {
  const file = clone(feud) as unknown as Record<string, unknown[]>;
  file[where] = [s];
  if (where === 'surveys') file.fastMoney = [clone(feud.fastMoney[0])];
  else file.surveys = [clone(feud.surveys[0])];
  const r = feudFileSchema.safeParse(file);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe('Family Feud rules', () => {
  it('accepts a good survey', () => {
    expect(feudProblems(survey())).toEqual([]);
  });

  it.each([
    [
      'an answer over 22 characters',
      { answers: [{ answer: 'A'.repeat(23), points: 30 }, ...answers(20, 10, 5)] },
      /longer than 22/,
    ],
    [
      'a lower-case answer',
      { answers: [{ answer: 'Lower', points: 30 }, ...answers(20, 10, 5)] },
      /capitals/,
    ],
    ['an answer with a slash', { answers: [{ answer: 'A/B', points: 30 }, ...answers(20, 10, 5)] }, /slash/],
    ['fractional points', { answers: [{ answer: 'X', points: 30.5 }, ...answers(20, 10, 5)] }, /whole/],
    ['points below 2', { answers: [...answers(30, 20, 10), { answer: 'LAST', points: 1 }] }, /at least 2/],
    ['a total over 100', { answers: answers(40, 30, 20, 15) }, /more than 100/],
    ['fewer than 4 answers', { answers: answers(40, 30, 20) }, /4 to 8/],
    ['more than 8 answers', { answers: answers(20, 15, 12, 10, 9, 8, 7, 6, 5) }, /4 to 8/],
    ['answers out of order', { answers: answers(10, 30, 20, 15) }, /highest points first/],
    ['an unknown difficulty', { difficulty: 'impossible' }, /./],
    ['an unknown key', { extra: 1 }, /./],
  ])('rejects %s', (_name, over, message) => {
    const problems = feudProblems(survey(over));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join('|')).toMatch(message);
  });

  it('rejects an alias shared across two answers of one survey', () => {
    const s = survey({
      answers: [
        { answer: 'CHECK PHONE', points: 30, aliases: ['phone'] },
        { answer: 'CALL MOM', points: 20, aliases: ['Phone!'] },
        ...answers(10, 5),
      ],
    });
    expect(feudProblems(s).join('|')).toMatch(/aliases must not be shared/);
  });

  it('rejects an alias equal to another answer text', () => {
    const s = survey({
      answers: [
        { answer: 'COFFEE', points: 30 },
        { answer: 'TEA', points: 20, aliases: ['coffee'] },
        ...answers(10, 5),
      ],
    });
    expect(feudProblems(s).join('|')).toMatch(/aliases must not be shared/);
  });

  it('allows the same alias on different surveys', () => {
    const file = clone(feud);
    expect(feudFileSchema.safeParse(file).success).toBe(true);
  });

  it('allows 5 to 12 answers in Fast Money but not 4 or 13', () => {
    const fm = (n: number): Record<string, unknown> => ({
      id: 'fm-x',
      question: 'Name something.',
      answers: Array.from({ length: n }, (_, i) => ({ answer: `ANS ${i}`, points: 100 / n > 8 ? 8 : 7 })).map(
        (a, i) => ({ ...a, points: Math.max(2, 13 - i) }),
      ),
    });
    expect(feudProblems(fm(12), 'fastMoney')).toEqual([]);
    expect(feudProblems(fm(5), 'fastMoney')).toEqual([]);
    expect(feudProblems(fm(4), 'fastMoney').join('|')).toMatch(/5 to 12/);
    expect(feudProblems(fm(13), 'fastMoney').join('|')).toMatch(/5 to 12/);
  });

  it('rejects ids duplicated across surveys and fastMoney', () => {
    const file = clone(feud);
    const fmFirst = file.fastMoney[0];
    const surveyFirst = file.surveys[0];
    if (!fmFirst || !surveyFirst) throw new Error('fixture');
    fmFirst.id = surveyFirst.id;
    const r = feudFileSchema.safeParse(file);
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues.map((i) => i.message).join('|')).toMatch(/not unique/);
  });
});

// --- Wheel -------------------------------------------------------------------------------------------

type Puzzle = Record<string, unknown>;
const puzzle = (over: Puzzle = {}): Puzzle => ({
  id: 'wp-1',
  category: 'PHRASE',
  phrase: 'EVERY CLOUD HAS A SILVER LINING',
  lines: ['EVERY CLOUD', 'HAS A SILVER', 'LINING'],
  use: ['round'],
  ...over,
});

/** Validate a wheel file made of the given puzzles. */
const wheelProblems = (...puzzles: Puzzle[]): string[] => {
  const file = { metadata: clone(wheel.metadata), puzzles };
  const r = wheelFileSchema.safeParse(file);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

/** Ten toss-ups for a category, so the per-category rule stays quiet in single-rule tests. */
const tenTossups = (category: string, prefix: string): Puzzle[] =>
  Array.from({ length: 10 }, (_, i) => ({
    id: `${prefix}-${i}`,
    category,
    phrase: `${prefix} ROUND ${'ABCDEFGHIJ'.charAt(i)}`,
    use: ['tossup'],
  }));

describe('Wheel of Fortune rules', () => {
  it('accepts a good puzzle', () => {
    expect(wheelProblems(puzzle(), ...tenTossups('PHRASE', 'TU'))).toEqual([]);
  });

  it.each([
    ['an unknown category', { category: 'NOT A CATEGORY' }, /./],
    ['a lower-case phrase', { phrase: 'every cloud', lines: undefined }, /capitals/],
    ['a digit in the phrase', { phrase: 'ROUTE 66', lines: undefined }, /capitals/],
    ['a double space', { phrase: 'TOO  MANY', lines: undefined }, /single spaces/],
    ['a leading space', { phrase: ' LEADING', lines: undefined }, /single spaces|capitals/],
    ['a long phrase without lines', { lines: undefined }, /needs lines/],
    [
      'lines that do not spell the phrase',
      { lines: ['EVERY CLOUD', 'HAS A SILVER', 'LINEING'] },
      /not the phrase/,
    ],
    [
      'a line over 13 characters in a 3-line puzzle',
      { phrase: 'ABCDEFGHIJKLMN OPQRSTUV WX', lines: ['ABCDEFGHIJKLMN', 'OPQRSTUV', 'WX'] },
      /row allows/,
    ],
    [
      'a top row over 12 characters',
      { phrase: 'ABCDEFGHIJKLM NOP QRS', lines: ['ABCDEFGHIJKLM', 'NOP', 'QRS'] },
      /row allows 12/,
    ],
    [
      'a bottom row over 12 in a 4-line puzzle',
      { phrase: 'AA BB CC ABCDEFGHIJKLM', lines: ['AA', 'BB', 'CC', 'ABCDEFGHIJKLM'] },
      /row allows 12/,
    ],
    ['a line over 14 characters', { phrase: 'ABCDEFGHIJKLMNO', lines: undefined }, /needs lines|row allows/],
    ['five lines', { phrase: 'A B C D E', lines: ['A', 'B', 'C', 'D', 'E'] }, /at most 4 lines/],
    ['a repeated use', { use: ['round', 'round'] }, /twice/],
    ['an unknown use', { use: ['finale'] }, /./],
    ['no use', { use: [] }, /./],
    ['a prize on a non-prize puzzle', { prize: { name: 'A CAR', value: 9000 } }, /only prize puzzles/],
    ['a prize puzzle with no prize', { use: ['prize'] }, /need a prize/],
    ['a prize below $7,000', { use: ['prize'], prize: { name: 'A CAR', value: 6999 } }, /at least 7000/],
    ['a prize above $15,000', { use: ['prize'], prize: { name: 'A CAR', value: 15001 } }, /at most 15000/],
    ['a fractional prize', { use: ['prize'], prize: { name: 'A CAR', value: 9000.5 } }, /whole/],
    ['a three-line toss-up', { use: ['tossup'] }, /take 1 to 2 lines/],
    ['a three-line tiebreaker', { use: ['tiebreak'] }, /take 1 to 2 lines/],
    [
      'a SAME LETTER puzzle with no sameLetter',
      { category: 'SAME LETTER', phrase: 'BIG BLUE BALL', lines: undefined },
      /need sameLetter/,
    ],
    [
      'a SAME LETTER vowel',
      { category: 'SAME LETTER', phrase: 'APPLE APRICOT', lines: undefined, sameLetter: 'A' },
      /consonant/,
    ],
    [
      'a SAME LETTER word starting with another letter',
      { category: 'SAME LETTER', phrase: 'BIG RED BALL', lines: undefined, sameLetter: 'B' },
      /start with B/,
    ],
  ])('rejects %s', (_name, over, message) => {
    const problems = wheelProblems(puzzle(over));
    expect(problems.join('|')).toMatch(message);
  });

  it('accepts a SAME LETTER puzzle with its letter', () => {
    expect(
      wheelProblems(
        puzzle({ category: 'SAME LETTER', phrase: 'BIG BLUE BALL', lines: undefined, sameLetter: 'B' }),
        ...tenTossups('PHRASE', 'TU'),
      ),
    ).toEqual([]);
  });

  it('lets a line end in a hyphen to break a hyphenated word', () => {
    expect(joinLines(['A WELL-', 'DESERVED', 'REST'])).toBe('A WELL-DESERVED REST');
    expect(
      wheelProblems(
        puzzle({ phrase: 'A WELL-DESERVED REST', lines: ['A WELL-', 'DESERVED', 'REST'] }),
        ...tenTossups('PHRASE', 'TU'),
      ),
    ).toEqual([]);
  });

  it('accepts 1- and 2-line toss-ups and rejects unique-violations', () => {
    const good = wheelProblems(
      puzzle({ id: 'a', phrase: 'SHORT ONE', lines: undefined, use: ['tossup'] }),
      puzzle({
        id: 'b',
        phrase: 'TWO LINE PHRASE HERE',
        lines: ['TWO LINE', 'PHRASE HERE'],
        use: ['tossup'],
      }),
      ...tenTossups('PHRASE', 'TU'),
    );
    expect(good).toEqual([]);
    expect(
      wheelProblems(
        puzzle({ id: 'x', phrase: 'DUP', lines: undefined }),
        puzzle({ id: 'x', phrase: 'DUP2', lines: undefined }),
      ).join('|'),
    ).toMatch(/id "x" is not unique/);
    expect(
      wheelProblems(
        puzzle({ id: 'x', phrase: 'DUP', lines: undefined }),
        puzzle({ id: 'y', phrase: 'DUP', lines: undefined }),
      ).join('|'),
    ).toMatch(/phrase "DUP" is not unique/);
  });

  describe('triple sets', () => {
    const member = (n: number, over: Puzzle = {}): Puzzle => ({
      id: `t-${n}`,
      category: 'THING',
      phrase: `TRIPLE ${'X'.repeat(n)}`,
      use: ['triple'],
      set: 'set-1',
      theme: 'THINGS',
      ...over,
    });
    const filler = tenTossups('THING', 'TT');
    it('accepts exactly three with one category and theme', () => {
      expect(wheelProblems(member(1), member(2), member(3), ...filler)).toEqual([]);
    });
    it('rejects two or four', () => {
      expect(wheelProblems(member(1), member(2), ...filler).join('|')).toMatch(/needs exactly 3/);
      expect(wheelProblems(member(1), member(2), member(3), member(4), ...filler).join('|')).toMatch(
        /needs exactly 3/,
      );
    });
    it('rejects mixed categories or themes', () => {
      expect(
        wheelProblems(member(1), member(2), member(3, { category: 'PLACE' }), ...filler).join('|'),
      ).toMatch(/mixes/);
      expect(wheelProblems(member(1), member(2), member(3, { theme: 'OTHER' }), ...filler).join('|')).toMatch(
        /mixes/,
      );
    });
    it('rejects a missing set or theme and a second use', () => {
      expect(wheelProblems(member(1, { set: undefined }), ...filler).join('|')).toMatch(/need a set/);
      expect(wheelProblems(member(1, { theme: undefined }), ...filler).join('|')).toMatch(/need a theme/);
      expect(wheelProblems(member(1, { use: ['triple', 'tossup'] }), ...filler).join('|')).toMatch(
        /no other use/,
      );
    });
  });

  describe('bonus puzzles', () => {
    const bonus = (over: Puzzle = {}): Puzzle[] => [
      { id: 'b-1', category: 'THING', phrase: 'BUBBLE WRAP', use: ['bonus'], ...over },
      ...tenTossups('THING', 'TT'),
    ];
    it('accepts a good one', () => {
      expect(wheelProblems(...bonus())).toEqual([]);
    });
    it('rejects one word', () => {
      expect(wheelProblems(...bonus({ phrase: 'BUBBLEWRAPPING' })).join('|')).toMatch(/2 to 4 words/);
    });
    it('rejects five words', () => {
      expect(
        wheelProblems(
          ...bonus({ phrase: 'ONE TWO THREE FOUR FIVE', lines: ['ONE TWO THREE', 'FOUR FIVE'] }),
        ).join('|'),
      ).toMatch(/2 to 4 words/);
    });
    it('rejects fewer than 7 letters', () => {
      expect(wheelProblems(...bonus({ phrase: 'AB CDE' })).join('|')).toMatch(/at least 7 letters/);
    });
    it('rejects a non-bonus category', () => {
      expect(wheelProblems(...bonus({ category: 'SONG LYRICS' })).join('|')).toMatch(
        /not a Bonus Round category/,
      );
    });
    it('rejects three lines', () => {
      expect(
        wheelProblems(...bonus({ phrase: 'ONE TWO THREE FOUR', lines: ['ONE', 'TWO', 'THREE FOUR'] })).join(
          '|',
        ),
      ).toMatch(/take 1 to 2 lines/);
    });
  });

  it('rejects a toss-up category with fewer than 10 toss-ups', () => {
    expect(wheelProblems(...tenTossups('THING', 'TT').slice(0, 9)).join('|')).toMatch(/needs at least 10/);
  });
});

describe('validateContent', () => {
  it('names the file, id and problem', () => {
    const bad = clone(feud);
    const first = bad.surveys[0];
    if (!first) throw new Error('fixture');
    first.answers = first.answers.slice(0, 2);
    const result = validateContentFiles({ feud: bad, wheel });
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toMatchObject({ file: 'family_feud.json', id: first.id });
    expect(result.problems[0]?.message).toMatch(/4 to 8/);
  });

  it('reports a malformed file', () => {
    const result = validateContentFiles({ feud: 'nope', wheel });
    expect(result.ok).toBe(false);
    expect(result.problems[0]?.file).toBe('family_feud.json');
  });

  it('rejects an id shared by both files', () => {
    const shared = clone(wheel);
    const p = shared.puzzles[0];
    if (!p) throw new Error('fixture');
    p.id = feud.surveys[0]?.id ?? '';
    const result = validateContentFiles({ feud, wheel: shared });
    expect(result.problems).toContainEqual(expect.objectContaining({ file: 'content', id: p.id }));
  });
});
