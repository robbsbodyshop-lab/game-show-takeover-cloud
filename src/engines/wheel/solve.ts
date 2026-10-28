/**
 * Solve judging (FR-041). Rules of record: docs/WHEEL_OF_FORTUNE_RULES.md, "Solving":
 * word for word, punctuation / spacing / case ignored, a lead-in like "It's a..." accepted,
 * a missing plural S is wrong (the app reports it as `close` so the host decides).
 */
export type SolveVerdict = 'correct' | 'close' | 'wrong';

/** Upper-case, "&" read as AND, apostrophes dropped, every other symbol a space. */
function normalise(text: string): string {
  return text
    .toUpperCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/&/g, ' AND ')
    .replace(/'/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

const LEAD_INS: readonly (readonly string[])[] = [
  ['THE', 'ANSWER', 'IS'],
  ['IT', 'IS'],
  ['IS', 'IT'],
  ['ITS'],
];

const ARTICLES = ['A', 'AN', 'THE'];

function stripLeadIn(words: string[]): string[] {
  for (const lead of LEAD_INS) {
    if (words.length > lead.length && lead.every((w, i) => words[i] === w)) {
      return words.slice(lead.length);
    }
  }
  return words;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = row;
  }
  return prev[b.length] ?? 0;
}

const compact = (words: string[]): string => words.join('');

function singleWordOffByOne(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  let off = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? '';
    const y = b[i] ?? '';
    if (x === y) continue;
    off += 1;
    if (off > 1 || levenshtein(x, y) > 1) return false;
  }
  return off === 1;
}

/**
 * `correct`: the same words ignoring case, punctuation, spacing and a lead-in.
 * `close`: Levenshtein distance <= 2 over the normalised strings, or one word one letter off
 * (a missing plural S lands here). `wrong`: anything else.
 */
export function judgeSolve(answer: string, phrase: string): SolveVerdict {
  const target = normalise(phrase).split(' ').filter(Boolean);
  const heard = normalise(answer).split(' ').filter(Boolean);
  if (target.length === 0 || heard.length === 0) return 'wrong';

  // Try the answer as spoken first so phrases that start with "IT'S" / "IS IT" still match.
  const candidates: string[][] = [heard];
  const stripped = stripLeadIn(heard);
  if (stripped !== heard) {
    candidates.push(stripped);
    const first = stripped[0];
    if (first && ARTICLES.includes(first) && target[0] !== first && stripped.length > 1) {
      candidates.push(stripped.slice(1));
    }
  }

  const want = compact(target);
  if (candidates.some((c) => compact(c) === want)) return 'correct';
  if (candidates.some((c) => levenshtein(compact(c), want) <= 2 || singleWordOffByOne(c, target))) {
    return 'close';
  }
  return 'wrong';
}
