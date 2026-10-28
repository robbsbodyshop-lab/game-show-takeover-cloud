/**
 * Family Feud content pickers (docs/reference/CONTENT_SCHEMA_V1.md, "Which survey a round gets").
 * Preference order: unused and in the round's size range, unused at the nearest size, then (pool dry)
 * reuse in range, then reuse anything. Nothing repeats while something fresh exists.
 */
import { getFeudContent } from './data.ts';
import { pickFromTiers, shuffled, toSet } from './pick.ts';
import type { FastMoneyQuestion, FeudRound, FeudSurvey, Rng, UsedIds } from './types.ts';

export const FAST_MONEY_QUESTIONS_PER_GAME = 5;

/** Preferred answer counts per round; Sudden Death has no size preference. */
export const ROUND_SIZE_RANGE: Record<Exclude<FeudRound, 'sudden-death'>, { min: number; max: number }> = {
  1: { min: 6, max: 8 },
  2: { min: 5, max: 7 },
  3: { min: 4, max: 6 },
  4: { min: 4, max: 4 },
};

/** True when #1 beats #2, so Sudden Death has one top answer. */
export const hasSingleClearTop = (s: FeudSurvey): boolean => {
  const [first, second] = s.answers;
  return first !== undefined && (second === undefined || first.points > second.points);
};

const distanceToRange = (n: number, range: { min: number; max: number }): number =>
  n < range.min ? range.min - n : n > range.max ? n - range.max : 0;

export const pickSurvey = (
  round: FeudRound,
  usedIds: UsedIds,
  rng: Rng,
  surveys: readonly FeudSurvey[] = getFeudContent().surveys,
): FeudSurvey | undefined => {
  const used = toSet(usedIds);
  const fresh = surveys.filter((s) => !used.has(s.id));

  if (round === 'sudden-death') {
    return pickFromTiers(
      [fresh.filter(hasSingleClearTop), surveys.filter(hasSingleClearTop), fresh, surveys],
      rng,
    );
  }

  const range = ROUND_SIZE_RANGE[round];
  const inRange = (s: FeudSurvey): boolean => distanceToRange(s.answers.length, range) === 0;
  // Next best unused boards: the smallest distance from the preferred size.
  const best = Math.min(...fresh.map((s) => distanceToRange(s.answers.length, range)));
  return pickFromTiers(
    [
      fresh.filter(inRange),
      fresh.filter((s) => distanceToRange(s.answers.length, range) === best),
      surveys.filter(inRange),
      surveys,
    ],
    rng,
  );
};

/** Deal five Fast Money questions, unused first; tops up with repeats only when fewer than five are fresh. */
export const pickFastMoney = (
  usedIds: UsedIds,
  rng: Rng,
  questions: readonly FastMoneyQuestion[] = getFeudContent().fastMoney,
  count: number = FAST_MONEY_QUESTIONS_PER_GAME,
): FastMoneyQuestion[] => {
  const used = toSet(usedIds);
  const fresh = shuffled(
    questions.filter((q) => !used.has(q.id)),
    rng,
  );
  const dealt = fresh.slice(0, count);
  if (dealt.length < count) {
    const reuse = shuffled(
      questions.filter((q) => used.has(q.id)),
      rng,
    );
    dealt.push(...reuse.slice(0, count - dealt.length));
  }
  return dealt;
};

export const countFreshSurveys = (surveys: readonly FeudSurvey[], usedIds: UsedIds): number => {
  const used = toSet(usedIds);
  return surveys.filter((s) => !used.has(s.id)).length;
};
