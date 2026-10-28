/**
 * Family Feud board helpers. Implements docs/FAMILY_FEUD_RULES.md Main game rules 1 (multipliers),
 * 6 (the bank) and 7 (leftover reveal, bottom up).
 */
import type { BoardSlot, FeudSurveyInput, RevealVia, Side } from './types';

export const BOARD_MAX_SLOTS = 8;
/** Round 1 and 2 single, round 3 double, round 4 triple. */
export const ROUND_MULTIPLIERS: readonly number[] = [1, 1, 2, 3];
export const SUDDEN_DEATH_MULTIPLIER = 3;
/** The last regular round; a game still undecided after it goes to Sudden Death. */
export const FINAL_REGULAR_ROUND = 4;

export const multiplierForRound = (round: number, suddenDeath: boolean): number => {
  if (suddenDeath) return SUDDEN_DEATH_MULTIPLIER;
  const index = Math.min(Math.max(round, 1), ROUND_MULTIPLIERS.length) - 1;
  return ROUND_MULTIPLIERS[index] ?? 1;
};

export const isValidSurvey = (survey: FeudSurveyInput): boolean =>
  typeof survey.question === 'string' &&
  survey.answers.length > 0 &&
  survey.answers.every(
    (entry) => entry.answer.trim() !== '' && Number.isFinite(entry.points) && entry.points >= 0,
  );

/**
 * Builds the board: at most 8 slots, highest points first (stable for ties). In Sudden Death
 * the board shows only the #1 answer.
 */
export const buildBoard = (survey: FeudSurveyInput, suddenDeath: boolean): BoardSlot[] => {
  const sorted = [...survey.answers].sort((a, b) => b.points - a.points);
  return sorted.slice(0, suddenDeath ? 1 : BOARD_MAX_SLOTS).map((entry) => ({
    answer: entry.answer,
    points: entry.points,
    aliases: entry.aliases ?? [],
    revealed: false,
    revealedBy: null,
    via: null,
  }));
};

export const isValidSlot = (board: readonly BoardSlot[], slot: number): boolean =>
  Number.isInteger(slot) && slot >= 0 && slot < board.length;

export const revealSlot = (
  board: readonly BoardSlot[],
  slot: number,
  by: Side | 'host',
  via: RevealVia,
): BoardSlot[] =>
  board.map((entry, index) => (index === slot ? { ...entry, revealed: true, revealedBy: by, via } : entry));

/** Face-off and control reveals count; a successful steal and leftover reveals do not. */
export const countsTowardBank = (slot: BoardSlot): boolean =>
  slot.revealed && (slot.via === 'faceoff' || slot.via === 'control');

/** The multiplied bank shown above the board. */
export const computeBank = (board: readonly BoardSlot[], multiplier: number): number =>
  board.reduce((sum, slot) => (countsTowardBank(slot) ? sum + slot.points : sum), 0) * multiplier;

/** What the bank would be if every answer were revealed by the controlling family. */
export const fullBoardBank = (board: readonly BoardSlot[], multiplier: number): number =>
  board.reduce((sum, slot) => sum + slot.points, 0) * multiplier;

export const isCleared = (board: readonly BoardSlot[]): boolean =>
  board.length > 0 && board.every((slot) => slot.revealed);

/** Hidden slot indexes in the order the host reveals them: bottom of the board first. */
export const leftoverOrder = (board: readonly BoardSlot[]): number[] => {
  const hidden: number[] = [];
  board.forEach((slot, index) => {
    if (!slot.revealed) hidden.push(index);
  });
  return hidden.reverse();
};
