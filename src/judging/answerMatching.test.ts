import { describe, expect, it } from 'vitest';
import { matchAnswer, matchAnswerAlternatives, type JudgeSurvey } from './answerMatching';
import { normalizeAnswer } from './normalize';
import { stemWord } from './stem';
import { SYNONYM_GROUPS, canonicalSynonym } from './synonyms';

const wakeUp: JudgeSurvey = {
  answers: [
    { answer: 'CHECK THEIR PHONE', aliases: ['phone', 'check phone', 'check my phone', 'check messages'] },
    { answer: 'HIT THE SNOOZE BUTTON', aliases: ['snooze', 'hit snooze', 'turn off the alarm'] },
    { answer: 'USE THE BATHROOM', aliases: ['bathroom', 'pee', 'go to the bathroom'] },
    { answer: 'STRETCH', aliases: ['stretching', 'yawn'] },
    { answer: 'DRINK COFFEE', aliases: ['coffee', 'make coffee'] },
    { answer: 'BRUSH THEIR TEETH', aliases: ['brush teeth', 'brush my teeth', 'teeth'] },
    { answer: 'SHOWER', aliases: ['take a shower', 'bathe'] },
  ],
};

const pets: JudgeSurvey = {
  answers: [
    { answer: 'DOG', aliases: ['puppy'] },
    { answer: 'CAT', aliases: ['kitten'] },
    { answer: 'FISH', aliases: ['goldfish'] },
    { answer: 'BIRD', aliases: ['parrot', 'pet'] },
    { answer: 'HAMSTER', aliases: ['pet'] },
    { answer: 'OX' },
    { answer: 'CHILD', aliases: ['baby'] },
    { answer: 'CELL PHONE' },
    { answer: 'ICE CREAM' },
    { answer: 'BERRY' },
  ],
};

type Case = readonly [
  name: string,
  text: string,
  survey: JudgeSurvey,
  verdict: string,
  slot: number | undefined,
];

const cases: readonly Case[] = [
  ['exact answer', 'check their phone', wakeUp, 'accept', 0],
  ['upper case and punctuation', 'CHECK, THEIR PHONE!!', wakeUp, 'accept', 0],
  ['extra spaces', '  check    their   phone  ', wakeUp, 'accept', 0],
  ['alias', 'snooze', wakeUp, 'accept', 1],
  ['alias with article', 'the bathroom', wakeUp, 'accept', 2],
  ['article inside answer', 'hit snooze button', wakeUp, 'accept', 1],
  ['lead-in um', 'um, coffee', wakeUp, 'accept', 4],
  ['lead-in I would say', "I'd say shower", wakeUp, 'accept', 6],
  ['lead-in with curly apostrophe', 'I’d say stretch', wakeUp, 'accept', 3],
  ['trailing hedge', 'coffee I guess', wakeUp, 'accept', 4],
  ['plural to singular', 'showers', wakeUp, 'accept', 6],
  ['gerund of answer', 'stretching', wakeUp, 'accept', 3],
  ['gerund of base word', 'showering', wakeUp, 'accept', 6],
  ['past tense', 'stretched', wakeUp, 'accept', 3],
  ['tense on a phrase', 'brushed teeth', wakeUp, 'accept', 5],
  ['plural on a phrase', 'brush their tooth', wakeUp, 'accept', 5],
  ['reordered words', 'phone check', wakeUp, 'accept', 0],
  ['one word different from a long answer', 'turn the alarm off', wakeUp, 'accept', 1],
  ['partial overlap goes to review', 'turn off the alarm clock', wakeUp, 'review', 1],
  ['compound written as one word', 'cellphone', pets, 'accept', 7],
  ['compound written as two words', 'ice-cream', pets, 'accept', 8],
  ['unrelated word', 'dance', wakeUp, 'miss', undefined],
  ['empty text', '', wakeUp, 'miss', undefined],
  ['only punctuation', '?!', wakeUp, 'miss', undefined],
  ['only a filler', 'um', wakeUp, 'miss', undefined],
  ['single word of a long answer is not enough', 'button', wakeUp, 'miss', undefined],
  ['y to ies', 'berries', pets, 'accept', 9],
  ['ies to y', 'puppies', pets, 'accept', 0],
  ['es plural', 'hamsters', pets, 'accept', 4],
  ['synonym kid to child', 'kid', pets, 'accept', 6],
  ['synonym plural kids', 'kids', pets, 'accept', 6],
  ['synonym children', 'children', pets, 'accept', 6],
  ['synonym infant to baby alias', 'infant', pets, 'accept', 6],
  ['synonym mobile to cell phone', 'cell mobile', pets, 'accept', 7],
  ['phrase word order for a synonym', 'phone cell', pets, 'accept', 7],
  ['two-word answer with one extra word is review', 'ice cream cone', pets, 'review', 8],
  ['exact short word', 'ox', pets, 'accept', 5],
  ['short word is not fuzzy', 'ax', pets, 'miss', undefined],
  ['short word is not a prefix', 'do', pets, 'miss', undefined],
  ['short word cannot become a plural stem', 'oxen', pets, 'miss', undefined],
  ['alias on two answers is review', 'pet', pets, 'review', undefined],
  ['alias on two answers lists both candidates', 'a pet', pets, 'review', undefined],
  ['unrelated to pets', 'giraffe', pets, 'miss', undefined],
  ['numbers kept', '3 fish', { answers: [{ answer: '3 FISH' }, { answer: '4 FISH' }] }, 'accept', 0],
  ['diacritics folded', 'café', { answers: [{ answer: 'CAFE' }] }, 'accept', 0],
  ['ampersand as and', 'salt & pepper', { answers: [{ answer: 'SALT AND PEPPER' }] }, 'accept', 0],
  ['possessives ignored in overlap', 'check your phone', wakeUp, 'accept', 0],
  ['survey with no aliases', 'pizza', { answers: [{ answer: 'PIZZA' }, { answer: 'BURGER' }] }, 'accept', 0],
  ['empty survey', 'pizza', { answers: [] }, 'miss', undefined],
];

describe('matchAnswer', () => {
  it.each(cases)('%s: "%s" -> %s', (_name, text, survey, verdict, slot) => {
    const result = matchAnswer(text, survey);
    expect(result.verdict).toBe(verdict);
    expect(result.slot).toBe(slot);
  });

  it('is table driven with at least 40 cases', () => {
    expect(cases.length).toBeGreaterThanOrEqual(40);
  });

  it('an alias matching two answers is a review and names both candidates', () => {
    const result = matchAnswer('pet', pets);
    expect(result.verdict).toBe('review');
    expect(result.slot).toBeUndefined();
    expect(result.candidates).toEqual([3, 4]);
  });

  it('gives accepts a confidence ordered exact > stem > synonym', () => {
    const exact = matchAnswer('dog', pets).confidence;
    const stem = matchAnswer('dogs', pets).confidence;
    const synonym = matchAnswer('kid', pets).confidence;
    expect(exact).toBe(1);
    expect(exact).toBeGreaterThan(stem);
    expect(stem).toBeGreaterThan(synonym);
  });

  it('suggests the single candidate on a review', () => {
    const result = matchAnswer('ice cream cone', pets);
    expect(result.verdict).toBe('review');
    expect(result.slot).toBe(8);
    expect(result.tier).toBe('overlap');
  });

  it('a unique strong overlap is an accept and a weak one is not', () => {
    const survey: JudgeSurvey = { answers: [{ answer: 'GO TO THE BEACH WITH FRIENDS' }] };
    expect(matchAnswer('go to beach with friend and', survey).verdict).toBe('accept');
    expect(matchAnswer('go to beach', survey).verdict).toBe('miss');
  });

  it('two overlapping answers are a review even when one is strong', () => {
    const survey: JudgeSurvey = {
      answers: [{ answer: 'GO TO THE BEACH WITH FRIENDS' }, { answer: 'GO TO THE BEACH WITH FAMILY' }],
    };
    const result = matchAnswer('go beach with friends family', survey);
    expect(result.verdict).toBe('review');
    expect(result.slot).toBeUndefined();
  });

  it('a miss is certain when nothing overlaps', () => {
    expect(matchAnswer('dance', wakeUp).confidence).toBe(1);
  });
});

describe('matchAnswerAlternatives', () => {
  it('picks the accept among speech alternatives', () => {
    const result = matchAnswerAlternatives(['hot dock', 'hamster', 'ham store'], pets);
    expect(result.verdict).toBe('accept');
    expect(result.slot).toBe(4);
  });

  it('keeps a review as a review even when the other alternatives miss', () => {
    const result = matchAnswerAlternatives(['ice cream cone', 'eyes cream', 'nothing'], pets);
    expect(result.verdict).toBe('review');
  });

  it('never upgrades a review to an accept', () => {
    const result = matchAnswerAlternatives(['pet', 'xylophone'], pets);
    expect(result.verdict).toBe('review');
  });

  it('prefers an accept over a review', () => {
    const result = matchAnswerAlternatives(['ice cream cone', 'fish'], pets);
    expect(result.verdict).toBe('accept');
    expect(result.slot).toBe(2);
  });

  it('turns two different accepts into a review', () => {
    const result = matchAnswerAlternatives(['dog', 'cat'], pets);
    expect(result.verdict).toBe('review');
    expect(result.candidates).toEqual([0, 1]);
  });

  it('is a miss with no usable alternatives', () => {
    expect(matchAnswerAlternatives([], pets).verdict).toBe('miss');
    expect(matchAnswerAlternatives(['', '  '], pets).verdict).toBe('miss');
  });

  it('is a miss when every alternative misses', () => {
    expect(matchAnswerAlternatives(['zebra', 'yak'], pets).verdict).toBe('miss');
  });
});

describe('normalizeAnswer', () => {
  it.each([
    ['The Pizza!', 'pizza'],
    ['  An  Apple, a day ', 'apple day'],
    ["Um, I'd say the beach", 'beach'],
    ['I think coffee', 'coffee'],
    ["it's pizza", 'pizza'],
    ['a', 'a'],
    ['the', 'the'],
    ['', ''],
  ])('"%s" -> "%s"', (input, expected) => {
    expect(normalizeAnswer(input)).toBe(expected);
  });
});

describe('stemWord', () => {
  it.each([
    ['cats', 'cat'],
    ['berries', 'berry'],
    ['boxes', 'box'],
    ['potatoes', 'potato'],
    ['glass', 'glass'],
    ['focus', 'focus'],
    ['running', 'run'],
    ['baked', 'bak'],
    ['bake', 'bak'],
    ['baking', 'bak'],
    ['carried', 'carry'],
    ['string', 'string'],
    ['bus', 'bus'],
    ['children', 'child'],
  ])('%s -> %s', (word, stem) => {
    expect(stemWord(word)).toBe(stem);
  });
});

describe('synonyms table', () => {
  it('has no word in two groups', () => {
    const seen = new Map<string, number>();
    SYNONYM_GROUPS.forEach((group, index) => {
      for (const word of group) {
        const key = stemWord(word);
        expect(seen.get(key) ?? index, `${word} appears in two groups`).toBe(index);
        seen.set(key, index);
      }
    });
  });

  it('folds the examples from the brief', () => {
    const fold = (word: string): string => canonicalSynonym(stemWord(word));
    expect(fold('cellphone')).toBe(fold('phone'));
    expect(fold('mobile')).toBe(fold('phone'));
    expect(fold('automobile')).toBe(fold('car'));
    expect(fold('child')).toBe(fold('kid'));
  });
});
