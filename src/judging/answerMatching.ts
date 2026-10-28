/**
 * Feud answer judging (FR-033): turns typed or spoken text into accept / review / miss against
 * a survey. The controller (not the engine) calls this and passes the resulting slot to the engine.
 *
 * Tiers, strongest first:
 *   exact    normalised text equals an answer or alias
 *   stem     equal after plural / tense stemming, ignoring spaces (words of 1-3 letters are never stemmed)
 *   synonym  equal after the curated synonym table is applied
 *   overlap  Jaccard similarity of the stemmed, synonym-folded words
 *
 * Any answer matched at exact / stem / synonym is an accept, unless two different answers match
 * (an alias standing for two answers): that is a review. Overlap of at least REVIEW_OVERLAP is
 * a review, or an accept when exactly one answer overlaps and the overlap is at least
 * STRONG_OVERLAP. Everything else is a miss.
 */
import { answerTokens, normalizeAnswer } from './normalize';
import { stemWord } from './stem';
import { canonicalSynonym } from './synonyms';

export type MatchVerdict = 'accept' | 'review' | 'miss';
export type MatchTier = 'exact' | 'stem' | 'synonym' | 'overlap';

export interface JudgeSurveyAnswer {
  readonly answer: string;
  readonly aliases?: readonly string[] | undefined;
}

/** The part of a survey the judge needs. A content survey or a board both fit. */
export interface JudgeSurvey {
  readonly answers: readonly JudgeSurveyAnswer[];
}

export interface MatchResult {
  readonly verdict: MatchVerdict;
  /** Set for an accept, and for a review with exactly one candidate (a suggestion only). */
  readonly slot?: number;
  /** 0..1. For a miss it is the confidence that nothing on the board was meant. */
  readonly confidence: number;
  /** Every slot that matched at any tier (empty for a miss). */
  readonly candidates: readonly number[];
  readonly tier?: MatchTier;
}

export const REVIEW_OVERLAP = 0.6;
export const STRONG_OVERLAP = 0.8;

const TIER_RANK: Readonly<Record<MatchTier, number>> = { exact: 4, stem: 3, synonym: 2, overlap: 1 };
const TIER_CONFIDENCE: Readonly<Record<'exact' | 'stem' | 'synonym', number>> = {
  exact: 1,
  stem: 0.95,
  synonym: 0.9,
};
const AMBIGUOUS_CONFIDENCE = 0.5;

/** Words that carry no meaning for overlap scoring. */
const FILLER = new Set([
  'my',
  'your',
  'their',
  'his',
  'her',
  'our',
  'its',
  'to',
  'of',
  'on',
  'in',
  'at',
  'for',
  'some',
]);

interface Forms {
  readonly exact: string;
  readonly stem: string;
  /** Stem form without spaces, so "cellphone" meets "cell phone". */
  readonly compact: string;
  readonly synonym: string;
  readonly bag: ReadonlySet<string>;
}

const stemToken = (token: string): string => (token.length <= 3 ? token : stemWord(token));

const formsOf = (text: string): Forms => {
  const tokens = answerTokens(text);
  const stems = tokens.map(stemToken);
  const folded = stems.map(canonicalSynonym);
  const bagSource = folded.filter((token) => !FILLER.has(token));
  return {
    exact: normalizeAnswer(text),
    stem: stems.join(' '),
    compact: stems.join(''),
    synonym: folded.join(' '),
    bag: new Set(bagSource.length > 0 ? bagSource : folded),
  };
};

const jaccard = (a: ReadonlySet<string>, b: ReadonlySet<string>): number => {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
};

interface SlotMatch {
  readonly slot: number;
  readonly tier: MatchTier;
  readonly score: number;
}

const matchSlot = (input: Forms, slot: number, entry: JudgeSurveyAnswer): SlotMatch | null => {
  let best: SlotMatch | null = null;
  const consider = (candidate: SlotMatch): void => {
    if (
      best === null ||
      TIER_RANK[candidate.tier] > TIER_RANK[best.tier] ||
      (candidate.tier === best.tier && candidate.score > best.score)
    ) {
      best = candidate;
    }
  };
  for (const text of [entry.answer, ...(entry.aliases ?? [])]) {
    const forms = formsOf(text);
    if (forms.exact === '') continue;
    if (forms.exact === input.exact) consider({ slot, tier: 'exact', score: 1 });
    else if (forms.stem === input.stem || forms.compact === input.compact)
      consider({ slot, tier: 'stem', score: 1 });
    else if (forms.synonym === input.synonym) consider({ slot, tier: 'synonym', score: 1 });
    else {
      const score = jaccard(input.bag, forms.bag);
      if (score >= REVIEW_OVERLAP) consider({ slot, tier: 'overlap', score });
    }
  }
  return best;
};

const bestPartial = (input: Forms, survey: JudgeSurvey): number => {
  let best = 0;
  for (const entry of survey.answers) {
    for (const text of [entry.answer, ...(entry.aliases ?? [])]) {
      best = Math.max(best, jaccard(input.bag, formsOf(text).bag));
    }
  }
  return best;
};

const MISS_EMPTY: MatchResult = { verdict: 'miss', confidence: 1, candidates: [] };

export const matchAnswer = (text: string, survey: JudgeSurvey): MatchResult => {
  const input = formsOf(text);
  if (input.exact === '') return MISS_EMPTY;

  const matches: SlotMatch[] = [];
  survey.answers.forEach((entry, slot) => {
    const found = matchSlot(input, slot, entry);
    if (found !== null) matches.push(found);
  });

  const candidates = matches.map((match) => match.slot);
  const solid = matches.filter((match) => match.tier !== 'overlap');
  const [onlySolid] = solid;

  if (onlySolid !== undefined && solid.length === 1 && onlySolid.tier !== 'overlap') {
    return {
      verdict: 'accept',
      slot: onlySolid.slot,
      confidence: TIER_CONFIDENCE[onlySolid.tier],
      candidates,
      tier: onlySolid.tier,
    };
  }
  if (solid.length > 1) {
    // An alias (or plain word) that stands for two answers must be ruled by the host.
    return { verdict: 'review', confidence: AMBIGUOUS_CONFIDENCE, candidates, tier: 'exact' };
  }

  const [onlyOverlap] = matches;
  if (onlyOverlap !== undefined && matches.length === 1) {
    const confidence = 0.5 + 0.35 * onlyOverlap.score;
    if (onlyOverlap.score >= STRONG_OVERLAP) {
      return { verdict: 'accept', slot: onlyOverlap.slot, confidence, candidates, tier: 'overlap' };
    }
    return { verdict: 'review', slot: onlyOverlap.slot, confidence, candidates, tier: 'overlap' };
  }
  if (matches.length > 1) {
    return { verdict: 'review', confidence: AMBIGUOUS_CONFIDENCE, candidates, tier: 'overlap' };
  }

  return { verdict: 'miss', confidence: Math.max(0.5, 1 - bestPartial(input, survey)), candidates: [] };
};

const VERDICT_RANK: Readonly<Record<MatchVerdict, number>> = { accept: 3, review: 2, miss: 1 };

/**
 * Judges the alternatives a speech recogniser returns (best guess first). Picks the strongest
 * verdict, then the highest confidence, then the earlier alternative. A review is never
 * upgraded to an accept, and two alternatives that accept different slots become a review.
 */
export const matchAnswerAlternatives = (
  alternatives: readonly string[],
  survey: JudgeSurvey,
): MatchResult => {
  const results = alternatives.filter((alt) => alt.trim() !== '').map((alt) => matchAnswer(alt, survey));
  let best: MatchResult | undefined;
  for (const result of results) {
    if (
      best === undefined ||
      VERDICT_RANK[result.verdict] > VERDICT_RANK[best.verdict] ||
      (result.verdict === best.verdict && result.confidence > best.confidence)
    ) {
      best = result;
    }
  }
  if (best === undefined) return MISS_EMPTY;

  if (best.verdict === 'accept') {
    const slots = new Set(results.filter((r) => r.verdict === 'accept').map((r) => r.slot));
    if (slots.size > 1) {
      const candidates = [...slots]
        .filter((slot): slot is number => slot !== undefined)
        .sort((a, b) => a - b);
      return { verdict: 'review', confidence: AMBIGUOUS_CONFIDENCE, candidates };
    }
  }
  return best;
};
