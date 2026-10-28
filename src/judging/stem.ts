/**
 * Light stemming for Feud judging (FR-033): plurals (s, es, ies) and tenses (ed, ing).
 * It is deliberately small. Words of 1-3 letters are never stemmed so that short words must
 * match exactly ("bus" must not become "bu"). Two words match when their stems are equal.
 */

const IRREGULAR: Readonly<Record<string, string>> = {
  children: 'child',
  men: 'man',
  women: 'woman',
  feet: 'foot',
  teeth: 'tooth',
  mice: 'mouse',
  geese: 'goose',
  people: 'person',
  knives: 'knife',
  wives: 'wife',
  lives: 'life',
  leaves: 'leaf',
  shelves: 'shelf',
  wolves: 'wolf',
};

const VOWEL = /[aeiouy]/;

const undouble = (root: string): string => {
  const last = root.at(-1);
  if (root.length > 3 && last !== undefined && last === root.at(-2) && !'lsz'.includes(last)) {
    return root.slice(0, -1);
  }
  return root;
};

const stripPlural = (word: string): string => {
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith('sses')) return word.slice(0, -2);
  if (/(ch|sh|x|z)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('oes') && word.length > 5) return word.slice(0, -2);
  if (word.endsWith('s') && !/(ss|us|is)$/.test(word) && word.length > 3) return word.slice(0, -1);
  return word;
};

const stripTense = (word: string): string => {
  if (word.endsWith('ing') && word.length > 5) {
    const root = word.slice(0, -3);
    if (VOWEL.test(root)) return undouble(root);
  }
  if (word.endsWith('ied') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith('ed') && word.length > 4) {
    const root = word.slice(0, -2);
    if (VOWEL.test(root)) return undouble(root);
  }
  return word;
};

/** Stem of one lower-case word. Words of 3 letters or fewer are returned unchanged. */
export const stemWord = (word: string): string => {
  if (word.length <= 3) return word;
  const irregular = IRREGULAR[word];
  if (irregular !== undefined) return irregular;
  let stem = stripTense(stripPlural(word));
  // Drop a final silent e so that bake / baked / baking all meet ("bak").
  if (stem.length > 3 && stem.endsWith('e')) stem = stem.slice(0, -1);
  return stem;
};
