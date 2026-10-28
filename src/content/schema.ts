/**
 * zod schemas for `family_feud.json` and `wheel_of_fortune.json`.
 * Implements every rule in docs/reference/CONTENT_SCHEMA_V1.md; `validateContent()` runs them over
 * the bundled files and names the file, id and problem for anything wrong.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------------------------

/** Every category used by the bundled puzzles (the show's category names, derived from the data). */
export const WHEEL_CATEGORIES = [
  'PHRASE',
  'THING',
  'THINGS',
  'PERSON',
  'PEOPLE',
  'PLACE',
  'FOOD & DRINK',
  'WHAT ARE YOU DOING?',
  'WHAT ARE YOU WEARING?',
  'AROUND THE HOUSE',
  'FUN & GAMES',
  'LIVING THING',
  'LIVING THINGS',
  'OCCUPATION',
  'EVENT',
  'SAME LETTER',
  'BEFORE & AFTER',
  'RHYME TIME',
  'SHOW BIZ',
  'TITLE',
  'ON THE MAP',
  'IN THE KITCHEN',
  'CLASSIC TV',
  'SONG LYRICS',
  'QUOTATION',
  'CHARACTER',
  'LANDMARK',
] as const;
export type WheelCategory = (typeof WHEEL_CATEGORIES)[number];

/** The categories the Bonus Round may use (the singular, person-sized ones carried by bonus puzzles). */
export const WHEEL_BONUS_CATEGORIES = [
  'PHRASE',
  'THING',
  'PERSON',
  'PLACE',
  'FOOD & DRINK',
  'WHAT ARE YOU DOING?',
  'WHAT ARE YOU WEARING?',
  'AROUND THE HOUSE',
  'FUN & GAMES',
  'LIVING THING',
  'OCCUPATION',
  'EVENT',
] as const satisfies readonly WheelCategory[];
export type WheelBonusCategory = (typeof WHEEL_BONUS_CATEGORIES)[number];

export const WHEEL_USES = ['round', 'tossup', 'triple', 'prize', 'tiebreak', 'bonus'] as const;
export type WheelUse = (typeof WHEEL_USES)[number];

export const FEUD_LIMITS = {
  answerMaxChars: 22,
  minPoints: 2,
  maxTotalPoints: 100,
  mainAnswers: { min: 4, max: 8 },
  fastMoneyAnswers: { min: 5, max: 12 },
} as const;

/** Board rows, top to bottom. */
export const BOARD_ROWS = [12, 14, 14, 12] as const;
/** Longest line allowed in a puzzle of three or four lines. */
export const MULTI_LINE_MAX_CHARS = 13;
export const MAX_BOARD_LINES = 4;
export const PRIZE_VALUE_RANGE = { min: 7000, max: 15000 } as const;
export const BONUS_LIMITS = { maxLines: 2, minWords: 2, maxWords: 4, minLetters: 7 } as const;
/** Toss-ups, triples, tiebreakers and bonus puzzles fit on the middle rows. */
export const SHORT_PUZZLE_MAX_LINES = 2;
export const TRIPLE_SET_SIZE = 3;
/** Fortune Frenzy needs this many toss-ups per category (its first 6 plus 4 spares). */
export const MIN_TOSSUPS_PER_CATEGORY = 10;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PHRASE_CHARS = /^[A-Z '&!?.-]+$/;
const VOWELS = 'AEIOU';

// ---------------------------------------------------------------------------------------------
// Family Feud
// ---------------------------------------------------------------------------------------------

const metadataSchema = z.strictObject({
  source: z.string().min(1),
  sourceUrl: z.string().min(1),
  lastValidated: z.string().regex(ISO_DATE, 'lastValidated must be YYYY-MM-DD'),
});

export const feudAnswerSchema = z.strictObject({
  answer: z
    .string()
    .min(1)
    .max(FEUD_LIMITS.answerMaxChars, `answer is longer than ${FEUD_LIMITS.answerMaxChars} characters`)
    .refine((s) => s === s.toUpperCase(), 'answer must be in capitals')
    .refine((s) => !s.includes('/'), 'answer must not contain a slash')
    .refine((s) => s === s.trim(), 'answer must not have leading or trailing spaces'),
  points: z
    .number()
    .int('points must be a whole number')
    .min(FEUD_LIMITS.minPoints, `points must be at least ${FEUD_LIMITS.minPoints}`),
  aliases: z.array(z.string().trim().min(1)).optional(),
});

/** Lower-case, strip punctuation, collapse spaces: the form used to compare aliases. */
export const normalizeAnswerText = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

type SurveyShape = z.infer<typeof feudSurveyBaseSchema>;

const feudSurveyBaseSchema = z.strictObject({
  id: z.string().min(1),
  question: z.string().trim().min(1),
  surveyed: z.string().min(1).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  source: z.string().min(1).optional(),
  answers: z.array(feudAnswerSchema),
});

/** Rules shared by main-game surveys and Fast Money questions, minus the answer-count range. */
const checkSurvey = (s: SurveyShape, ctx: z.RefinementCtx, range: { min: number; max: number }): void => {
  const n = s.answers.length;
  if (n < range.min || n > range.max) {
    ctx.addIssue({
      code: 'custom',
      path: ['answers'],
      message: `needs ${range.min} to ${range.max} answers, has ${n}`,
    });
  }
  const total = s.answers.reduce((sum, a) => sum + a.points, 0);
  if (total > FEUD_LIMITS.maxTotalPoints) {
    ctx.addIssue({
      code: 'custom',
      path: ['answers'],
      message: `points add up to ${total}, more than ${FEUD_LIMITS.maxTotalPoints}`,
    });
  }
  s.answers.forEach((a, i) => {
    const prev = s.answers[i - 1];
    if (prev && a.points > prev.points) {
      ctx.addIssue({
        code: 'custom',
        path: ['answers', i, 'points'],
        message: 'answers must be listed highest points first',
      });
    }
  });
  // Every normalized answer text and alias may stand for one answer only.
  const owner = new Map<string, number>();
  s.answers.forEach((a, i) => {
    const forms = new Set([normalizeAnswerText(a.answer), ...(a.aliases ?? []).map(normalizeAnswerText)]);
    for (const form of forms) {
      const other = owner.get(form);
      if (other !== undefined && other !== i) {
        ctx.addIssue({
          code: 'custom',
          path: ['answers', i],
          message: `"${form}" also stands for answer ${other + 1} (aliases must not be shared)`,
        });
      } else {
        owner.set(form, i);
      }
    }
  });
};

export const feudSurveySchema = feudSurveyBaseSchema.superRefine((s, ctx) => {
  checkSurvey(s, ctx, FEUD_LIMITS.mainAnswers);
});
export const fastMoneyQuestionSchema = feudSurveyBaseSchema.superRefine((s, ctx) => {
  checkSurvey(s, ctx, FEUD_LIMITS.fastMoneyAnswers);
});

export const feudFileSchema = z
  .strictObject({
    metadata: metadataSchema,
    surveys: z.array(feudSurveySchema).min(1),
    fastMoney: z.array(fastMoneyQuestionSchema).min(1),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    const lists = [
      ['surveys', file.surveys],
      ['fastMoney', file.fastMoney],
    ] as const;
    for (const [key, list] of lists) {
      list.forEach((item, i) => {
        if (seen.has(item.id)) {
          ctx.addIssue({
            code: 'custom',
            path: [key, i, 'id'],
            message: `id "${item.id}" is not unique across surveys and fastMoney`,
          });
        }
        seen.add(item.id);
      });
    }
  });

// ---------------------------------------------------------------------------------------------
// Wheel of Fortune
// ---------------------------------------------------------------------------------------------

/** Rejoin board lines into a phrase: a line ending in a hyphen continues the word on the next line. */
export const joinLines = (lines: readonly string[]): string =>
  lines.reduce((acc, line, i) => (i === 0 ? line : acc.endsWith('-') ? acc + line : `${acc} ${line}`), '');

/** The longest line each row can hold for a puzzle of `lineCount` lines (top row first). */
export const rowCapacities = (lineCount: number): number[] => {
  switch (lineCount) {
    case 1:
      return [BOARD_ROWS[1]];
    case 2:
      return [BOARD_ROWS[1], BOARD_ROWS[2]];
    case 3:
      return [BOARD_ROWS[0], MULTI_LINE_MAX_CHARS, MULTI_LINE_MAX_CHARS];
    case 4:
      return [BOARD_ROWS[0], MULTI_LINE_MAX_CHARS, MULTI_LINE_MAX_CHARS, BOARD_ROWS[3]];
    default:
      return [];
  }
};

/** The lines a puzzle is shown on: its `lines`, or the phrase on one line. */
export const puzzleLines = (p: {
  phrase: string;
  lines?: readonly string[] | undefined;
}): readonly string[] => p.lines ?? [p.phrase];

export const countLetters = (s: string): number => (s.match(/[A-Z]/g) ?? []).length;

const prizeSchema = z.strictObject({
  name: z.string().trim().min(1),
  value: z
    .number()
    .int('prize value must be a whole number')
    .min(PRIZE_VALUE_RANGE.min, `prize value must be at least ${PRIZE_VALUE_RANGE.min}`)
    .max(PRIZE_VALUE_RANGE.max, `prize value must be at most ${PRIZE_VALUE_RANGE.max}`),
});

const wheelPuzzleBaseSchema = z.strictObject({
  id: z.string().min(1),
  category: z.enum(WHEEL_CATEGORIES),
  phrase: z
    .string()
    .min(1)
    .regex(PHRASE_CHARS, "phrase may use capitals A-Z, spaces and ' & ! ? . - only")
    .refine(
      (s) => s === s.trim() && !s.includes('  '),
      'phrase needs single spaces and no leading/trailing space',
    ),
  lines: z.array(z.string().min(1)).optional(),
  use: z.array(z.enum(WHEEL_USES)).min(1),
  sameLetter: z.string().optional(),
  notes: z.string().optional(),
  prize: prizeSchema.optional(),
  set: z.string().min(1).optional(),
  theme: z.string().min(1).optional(),
});

export const wheelPuzzleSchema = wheelPuzzleBaseSchema.superRefine((p, ctx) => {
  const add = (path: (string | number)[], message: string): void => {
    ctx.addIssue({ code: 'custom', path, message });
  };

  // Lines: needed beyond 14 characters, must spell the phrase and fit the board.
  const lineList = puzzleLines(p);
  if (!p.lines && p.phrase.length > BOARD_ROWS[1]) {
    add(['lines'], `phrase is longer than ${BOARD_ROWS[1]} characters, so it needs lines`);
  }
  if (p.lines) {
    if (p.lines.length > MAX_BOARD_LINES) add(['lines'], `at most ${MAX_BOARD_LINES} lines`);
    if (p.lines.some((l) => l !== l.trim() || l.includes('  '))) {
      add(['lines'], 'lines must not have leading, trailing or double spaces');
    } else if (joinLines(p.lines) !== p.phrase) {
      add(['lines'], `lines spell "${joinLines(p.lines)}", not the phrase`);
    }
  }
  const caps = rowCapacities(lineList.length);
  lineList.forEach((line, i) => {
    const cap = caps[i];
    if (cap !== undefined && line.length > cap) {
      add(
        ['lines', i],
        `"${line}" is ${line.length} characters; row allows ${cap} in a ${lineList.length}-line puzzle`,
      );
    }
  });

  const uses = new Set(p.use);
  if (uses.size !== p.use.length) add(['use'], 'use lists a value twice');

  // Toss-up style puzzles share the middle two rows.
  for (const u of ['tossup', 'triple', 'tiebreak', 'bonus'] as const) {
    const max = u === 'bonus' ? BONUS_LIMITS.maxLines : SHORT_PUZZLE_MAX_LINES;
    if (uses.has(u) && lineList.length > max) add(['lines'], `${u} puzzles take 1 to ${max} lines`);
  }

  if (uses.has('triple')) {
    if (p.use.length !== 1) add(['use'], 'triple puzzles have no other use');
    if (!p.set) add(['set'], 'triple puzzles need a set');
    if (!p.theme) add(['theme'], 'triple puzzles need a theme');
  }

  if (uses.has('prize')) {
    if (!p.prize) add(['prize'], 'prize puzzles need a prize { name, value }');
  } else if (p.prize) {
    add(['prize'], 'only prize puzzles carry a prize');
  }

  if (uses.has('bonus')) {
    const words = p.phrase.split(' ').length;
    if (words < BONUS_LIMITS.minWords || words > BONUS_LIMITS.maxWords) {
      add(
        ['phrase'],
        `bonus puzzles have ${BONUS_LIMITS.minWords} to ${BONUS_LIMITS.maxWords} words, this has ${words}`,
      );
    }
    if (countLetters(p.phrase) < BONUS_LIMITS.minLetters) {
      add(['phrase'], `bonus puzzles have at least ${BONUS_LIMITS.minLetters} letters`);
    }
    if (!(WHEEL_BONUS_CATEGORIES as readonly string[]).includes(p.category)) {
      add(['category'], `${p.category} is not a Bonus Round category`);
    }
  }

  if (p.category === 'SAME LETTER') {
    const letter = p.sameLetter;
    if (!letter) {
      add(['sameLetter'], 'SAME LETTER puzzles need sameLetter');
    } else if (!/^[A-Z]$/.test(letter) || VOWELS.includes(letter)) {
      add(['sameLetter'], 'sameLetter must be one consonant');
    } else if (!p.phrase.split(' ').every((w) => w.startsWith(letter))) {
      add(['sameLetter'], `every word must start with ${letter}`);
    }
  }
});

export const wheelFileSchema = z
  .strictObject({
    metadata: metadataSchema,
    puzzles: z.array(wheelPuzzleSchema).min(1),
  })
  .superRefine((file, ctx) => {
    const ids = new Set<string>();
    const phrases = new Set<string>();
    file.puzzles.forEach((p, i) => {
      if (ids.has(p.id))
        ctx.addIssue({ code: 'custom', path: ['puzzles', i, 'id'], message: `id "${p.id}" is not unique` });
      ids.add(p.id);
      if (phrases.has(p.phrase)) {
        ctx.addIssue({
          code: 'custom',
          path: ['puzzles', i, 'phrase'],
          message: `phrase "${p.phrase}" is not unique`,
        });
      }
      phrases.add(p.phrase);
    });

    // Triple Toss-Up sets: exactly 3, one category and theme, played in file order.
    const sets = new Map<string, { index: number; category: string; theme: string | undefined }[]>();
    file.puzzles.forEach((p, index) => {
      if (!p.use.includes('triple') || !p.set) return;
      const members = sets.get(p.set) ?? [];
      members.push({ index, category: p.category, theme: p.theme });
      sets.set(p.set, members);
    });
    for (const [set, members] of sets) {
      const first = members[0];
      if (!first) continue;
      if (members.length !== TRIPLE_SET_SIZE) {
        ctx.addIssue({
          code: 'custom',
          path: ['puzzles', first.index, 'set'],
          message: `set "${set}" has ${members.length} puzzles, needs exactly ${TRIPLE_SET_SIZE}`,
        });
      }
      for (const m of members) {
        if (m.category !== first.category || m.theme !== first.theme) {
          ctx.addIssue({
            code: 'custom',
            path: ['puzzles', m.index, 'set'],
            message: `set "${set}" mixes categories or themes`,
          });
        }
      }
    }

    // Fortune Frenzy opens in any toss-up category with 10 puzzles, so every one must have them.
    const perCategory = new Map<string, number>();
    for (const p of file.puzzles) {
      if (p.use.includes('tossup')) perCategory.set(p.category, (perCategory.get(p.category) ?? 0) + 1);
    }
    for (const [category, n] of perCategory) {
      if (n < MIN_TOSSUPS_PER_CATEGORY) {
        ctx.addIssue({
          code: 'custom',
          path: ['puzzles'],
          message: `toss-up category ${category} has ${n} toss-ups, needs at least ${MIN_TOSSUPS_PER_CATEGORY}`,
        });
      }
    }
  });

// ---------------------------------------------------------------------------------------------
// validateContent
// ---------------------------------------------------------------------------------------------

export type ContentFileName = 'family_feud.json' | 'wheel_of_fortune.json' | 'content';
export interface ContentProblem {
  file: ContentFileName;
  /** The survey, question or puzzle id; `(file)` for a problem with the file itself. */
  id: string;
  message: string;
}
export interface ContentValidation {
  ok: boolean;
  problems: ContentProblem[];
}

interface RawItem {
  id?: unknown;
}

const itemAt = (raw: unknown, key: string, index: unknown): RawItem | undefined => {
  if (typeof raw !== 'object' || raw === null || typeof index !== 'number') return undefined;
  const list = (raw as Record<string, unknown>)[key];
  if (!Array.isArray(list)) return undefined;
  const item: unknown = list[index];
  return typeof item === 'object' && item !== null ? item : undefined;
};

/** Turn a zod failure into {file, id, message} rows, resolving each issue's path to its item's id. */
export const toProblems = (file: ContentFileName, raw: unknown, error: z.ZodError): ContentProblem[] =>
  error.issues.map((issue) => {
    const [key, index, ...rest] = issue.path;
    const item = typeof key === 'string' ? itemAt(raw, key, index) : undefined;
    const id = typeof item?.id === 'string' ? item.id : '(file)';
    const where = item ? rest : issue.path;
    const prefix = where.length ? `${where.map(String).join('.')}: ` : '';
    return { file, id, message: `${prefix}${issue.message}` };
  });

const idsOf = (raw: unknown, keys: readonly string[]): string[] => {
  const out: string[] = [];
  if (typeof raw !== 'object' || raw === null) return out;
  for (const key of keys) {
    const list = (raw as Record<string, unknown>)[key];
    if (!Array.isArray(list)) continue;
    for (const item of list as unknown[]) {
      const id = typeof item === 'object' && item !== null ? (item as RawItem).id : undefined;
      if (typeof id === 'string') out.push(id);
    }
  }
  return out;
};

export interface ContentFiles {
  feud: unknown;
  wheel: unknown;
}

/** Validate both content files and the ids they share (the used-content list holds ids of both). */
export const validateContentFiles = (files: ContentFiles): ContentValidation => {
  const problems: ContentProblem[] = [];
  const feud = feudFileSchema.safeParse(files.feud);
  if (!feud.success) problems.push(...toProblems('family_feud.json', files.feud, feud.error));
  const wheel = wheelFileSchema.safeParse(files.wheel);
  if (!wheel.success) problems.push(...toProblems('wheel_of_fortune.json', files.wheel, wheel.error));

  const feudIds = new Set(idsOf(files.feud, ['surveys', 'fastMoney']));
  for (const id of new Set(idsOf(files.wheel, ['puzzles']))) {
    if (feudIds.has(id)) {
      problems.push({
        file: 'content',
        id,
        message: 'id is used in both family_feud.json and wheel_of_fortune.json',
      });
    }
  }
  return { ok: problems.length === 0, problems };
};
