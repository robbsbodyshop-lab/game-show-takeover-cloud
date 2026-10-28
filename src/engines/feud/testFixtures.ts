/** Shared fixtures for the Feud engine tests. Not part of the runtime bundle. */
import { createFeudState, feudReducer } from './feudEngine';
import type { FeudAction, FeudSettings, FeudState, FeudSurveyInput, Side } from './types';

export const survey = (
  id: string,
  rows: readonly (readonly [string, number] | readonly [string, number, readonly string[]])[],
  question = `Question ${id}?`,
): FeudSurveyInput => ({
  id,
  question,
  answers: rows.map(([answer, points, aliases]) => ({ answer, points, ...(aliases ? { aliases } : {}) })),
});

/** Five answers, 95 points in all: slots 0..4. */
export const SURVEY: FeudSurveyInput = survey('s1', [
  ['Pizza', 40, ['pie']],
  ['Burger', 25],
  ['Tacos', 15],
  ['Salad', 10],
  ['Soup', 5],
]);

export const SURVEY_2: FeudSurveyInput = survey('s2', [
  ['Red', 30],
  ['Blue', 30],
  ['Green', 20],
  ['Pink', 10],
]);

export const SD_SURVEY: FeudSurveyInput = survey('sd1', [
  ['Water', 50],
  ['Juice', 30],
  ['Milk', 20],
]);

export const makeGame = (
  settings?: Partial<FeudSettings>,
  sizes: { A: number; B: number } = { A: 5, B: 5 },
): FeudState =>
  createFeudState({
    families: { A: { teamId: 'team-a', podiumSize: sizes.A }, B: { teamId: 'team-b', podiumSize: sizes.B } },
    settings,
  });

export const run = (state: FeudState, ...actions: FeudAction[]): FeudState =>
  actions.reduce((current, action) => feudReducer(current, action), state);

export const eventTypes = (state: FeudState): string[] => state.events.map((event) => event.type);

export const startRound = (
  s: FeudSurveyInput = SURVEY,
  settings?: Partial<FeudSettings>,
  sizes?: { A: number; B: number },
): FeudState => run(makeGame(settings, sizes), { type: 'START_GAME' }, { type: 'START_ROUND', survey: s });

/** Buzzers open and `first` has buzzed: the first player is about to answer. */
export const atFirstAnswer = (
  first: Side = 'A',
  s: FeudSurveyInput = SURVEY,
  settings?: Partial<FeudSettings>,
): FeudState => run(startRound(s, settings), { type: 'OPEN_BUZZERS' }, { type: 'BUZZ', team: first, at: 1 });

/** `winner` won the face-off with the #1 answer and is at play-or-pass. */
export const atPlayOrPass = (
  winner: Side = 'A',
  s: FeudSurveyInput = SURVEY,
  settings?: Partial<FeudSettings>,
): FeudState => run(atFirstAnswer(winner, s, settings), { type: 'FACEOFF_ANSWER', slot: 0 });

/** `winner` won the face-off with #1 and chose to play; slot 0 is revealed. */
export const atControl = (
  winner: Side = 'A',
  s: FeudSurveyInput = SURVEY,
  settings?: Partial<FeudSettings>,
): FeudState => run(atPlayOrPass(winner, s, settings), { type: 'PLAY' });

export const strikeOut = (state: FeudState): FeudState =>
  run(
    state,
    { type: 'ANSWER', slot: 'miss' },
    { type: 'ANSWER', slot: 'miss' },
    { type: 'ANSWER', slot: 'miss' },
  );

/** Control family reaches the third strike: at steal-confer. */
export const atSteal = (
  winner: Side = 'A',
  s: FeudSurveyInput = SURVEY,
  settings?: Partial<FeudSettings>,
): FeudState => strikeOut(atControl(winner, s, settings));

/** Clears the whole board from a control state, ending the round for the controlling family. */
export const clearBoard = (state: FeudState): FeudState =>
  state.board.reduce(
    (current, slot, index) => (slot.revealed ? current : run(current, { type: 'ANSWER', slot: index })),
    state,
  );

/** A round won outright by `winner` (face-off #1, play, clear), left at round-summary. */
export const roundWonBy = (state: FeudState, winner: Side, s: FeudSurveyInput = SURVEY): FeudState =>
  clearBoard(
    run(
      state,
      { type: 'START_ROUND', survey: s },
      { type: 'OPEN_BUZZERS' },
      { type: 'BUZZ', team: winner, at: 1 },
      { type: 'FACEOFF_ANSWER', slot: 0 },
      { type: 'PLAY' },
    ),
  );

/** Four low-scoring rounds (winners A, B, A, B), left at round-summary of round 4. */
export const afterFourRounds = (settings?: Partial<FeudSettings>): FeudState => {
  let state = run(makeGame(settings), { type: 'START_GAME' });
  const tiny = survey('tiny', [['x', 1]]);
  (['A', 'B', 'A', 'B'] as const).forEach((winner, index) => {
    if (index > 0) state = run(state, { type: 'NEXT_ROUND' });
    state = roundWonBy(state, winner, tiny);
  });
  return state;
};

/** Four undecided rounds, then NEXT_ROUND: waiting for the Sudden Death question. */
export const atSuddenDeath = (): FeudState => run(afterFourRounds(), { type: 'NEXT_ROUND' });
