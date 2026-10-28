/**
 * A small curated synonym table for Feud judging (FR-033). Each group lists words that a
 * player may use for the same survey answer. Words are compared after stemming, and the
 * first member of a group is its canonical form. Keep groups tight: a wrong synonym turns
 * a miss into an automatic accept.
 */
import { stemWord } from './stem';

export const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ['phone', 'cellphone', 'mobile', 'smartphone', 'iphone'],
  ['car', 'automobile', 'auto'],
  ['kid', 'child', 'children', 'youngster'],
  ['baby', 'infant'],
  ['tv', 'television', 'telly'],
  ['couch', 'sofa', 'settee'],
  ['bike', 'bicycle'],
  ['pants', 'trousers', 'slacks'],
  ['sneakers', 'trainers'],
  ['mom', 'mother', 'mum', 'mommy', 'mama'],
  ['dad', 'father', 'daddy', 'papa'],
  ['grandma', 'grandmother', 'granny', 'nana'],
  ['grandpa', 'grandfather', 'granddad'],
  ['cop', 'policeman', 'police'],
  ['doctor', 'physician', 'doc'],
  ['money', 'cash'],
  ['movie', 'film'],
  ['trash', 'garbage', 'rubbish'],
  ['sweater', 'jumper'],
  ['fridge', 'refrigerator'],
  ['toilet', 'loo', 'lavatory', 'commode'],
  ['bathroom', 'restroom', 'washroom'],
  ['glasses', 'spectacles', 'eyeglasses'],
  ['bunny', 'rabbit'],
  ['dog', 'doggy', 'doggie'],
  ['kitten', 'kitty'],
  ['vacation', 'holiday'],
  ['candy', 'sweets'],
  ['cookie', 'biscuit'],
  ['buy', 'purchase'],
  ['start', 'begin'],
  ['big', 'large'],
  ['small', 'little', 'tiny'],
  ['smart', 'intelligent', 'clever'],
  ['yell', 'shout'],
  ['sleepy', 'tired', 'drowsy'],
  ['laptop', 'notebook'],
  ['shop', 'store'],
  ['friend', 'buddy', 'pal'],
  ['lawyer', 'attorney'],
  ['present', 'gift'],
  ['purse', 'handbag'],
  ['jacket', 'coat'],
  ['sick', 'ill'],
];

const buildIndex = (): Map<string, string> => {
  const index = new Map<string, string>();
  for (const group of SYNONYM_GROUPS) {
    const head = group[0];
    if (head === undefined) continue;
    const canonical = stemWord(head);
    for (const member of group) {
      // Multi-word members are not supported by the token matcher; skip them.
      if (member.includes(' ')) continue;
      const key = stemWord(member);
      if (!index.has(key)) index.set(key, canonical);
    }
  }
  return index;
};

const INDEX = buildIndex();

/** Canonical form of an already stemmed word, or the word itself when it has no synonyms. */
export const canonicalSynonym = (stem: string): string => INDEX.get(stem) ?? stem;
