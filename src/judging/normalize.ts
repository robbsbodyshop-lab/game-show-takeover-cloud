/**
 * Answer normalisation for Feud judging (FR-033). Implements the "typed answers are judged
 * against the survey" part of docs/FAMILY_FEUD_RULES.md; the rules doc itself says nothing
 * about spelling, so everything here is an app choice made to keep judging forgiving but safe.
 */

/** Spoken or typed lead-ins that are not part of the answer ("um, I'd say pizza"). */
const LEAD_INS: readonly (readonly string[])[] = [
  ['let', 'me', 'think'],
  ['my', 'answer', 'is'],
  ['the', 'answer', 'is'],
  ['i', 'would', 'say'],
  ['i', 'd', 'say'],
  ['id', 'say'],
  ['i', 'think'],
  ['i', 'guess'],
  ['i', 'believe'],
  ['i', 'say'],
  ['how', 'about'],
  ['is', 'it'],
  ['it', 's'],
  ['its'],
  ['maybe'],
  ['perhaps'],
  ['probably'],
  ['okay'],
  ['ok'],
  ['umm'],
  ['uhh'],
  ['erm'],
  ['hmm'],
  ['um'],
  ['uh'],
  ['er'],
  ['ah'],
];

/** Trailing hedges ("pizza i guess", "pizza maybe"). */
const TRAIL_INS: readonly (readonly string[])[] = [
  ['i', 'guess'],
  ['i', 'think'],
  ['i', 'suppose'],
  ['maybe'],
  ['probably'],
  ['please'],
  ['umm'],
  ['um'],
  ['uh'],
];

const ARTICLES = new Set(['a', 'an', 'the']);

const startsWithPhrase = (tokens: readonly string[], phrase: readonly string[], at: number): boolean =>
  phrase.every((word, i) => tokens[at + i] === word);

/** Splits text into lower-case alphanumeric words with punctuation and diacritics removed. */
export const rawTokens = (text: string): string[] => {
  const cleaned = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’‘`]/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return cleaned === '' ? [] : cleaned.split(/\s+/);
};

/** Words of an answer after lead-ins, hedges and articles are removed. Never empties a non-empty answer. */
export const answerTokens = (text: string): string[] => {
  let tokens = rawTokens(text);
  const original = tokens;

  let changed = true;
  while (changed) {
    changed = false;
    for (const phrase of LEAD_INS) {
      if (tokens.length > phrase.length && startsWithPhrase(tokens, phrase, 0)) {
        tokens = tokens.slice(phrase.length);
        changed = true;
        break;
      }
    }
  }

  changed = true;
  while (changed) {
    changed = false;
    for (const phrase of TRAIL_INS) {
      const start = tokens.length - phrase.length;
      if (start > 0 && startsWithPhrase(tokens, phrase, start)) {
        tokens = tokens.slice(0, start);
        changed = true;
        break;
      }
    }
  }

  const withoutArticles = tokens.filter((token) => !ARTICLES.has(token));
  if (withoutArticles.length > 0) return withoutArticles;
  return tokens.length > 0 ? tokens : original;
};

/** Canonical comparison form: lower case, no punctuation, single spaces, no articles or lead-ins. */
export const normalizeAnswer = (text: string): string => answerTokens(text).join(' ');
