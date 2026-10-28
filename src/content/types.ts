/** Content types, inferred from the zod schemas so the two can never drift. */
import type { z } from 'zod';
import type {
  feudAnswerSchema,
  feudFileSchema,
  feudSurveySchema,
  fastMoneyQuestionSchema,
  wheelFileSchema,
  wheelPuzzleSchema,
} from './schema.ts';

export type { WheelBonusCategory, WheelCategory, WheelUse } from './schema.ts';

export type FeudAnswer = z.infer<typeof feudAnswerSchema>;
export type FeudSurvey = z.infer<typeof feudSurveySchema>;
export type FastMoneyQuestion = z.infer<typeof fastMoneyQuestionSchema>;
export type FeudFile = z.infer<typeof feudFileSchema>;
export type WheelPuzzle = z.infer<typeof wheelPuzzleSchema>;
export type WheelFile = z.infer<typeof wheelFileSchema>;

/** Injected randomness: a function returning a float in [0, 1). */
export type Rng = () => number;

/** Ids of content already played this event (the event's `usedContentIds`). */
export type UsedIds = Iterable<string>;

export type FeudRound = 1 | 2 | 3 | 4 | 'sudden-death';

/** The puzzle pools the Wheel pickers draw from. */
export type WheelPickUse = 'round' | 'tossup' | 'prize' | 'tiebreak' | 'bonus';

export interface TripleSet {
  set: string;
  theme: string;
  category: WheelPuzzle['category'];
  /** The three puzzles, in the file order they are played. */
  puzzles: readonly [WheelPuzzle, WheelPuzzle, WheelPuzzle];
}
