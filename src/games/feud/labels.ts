import type { Side } from '@/engines/feud/types';
import type { FeudViewModel } from './types';

/** The name typed for a podium position, or "Player N". */
export const displayName = (name: string | undefined, index: number): string => {
  const trimmed = name?.trim();
  return trimmed === undefined || trimmed === '' ? `Player ${(index + 1).toString()}` : trimmed;
};

/** "Player 3" or the name the host typed for that podium position. */
export const podiumName = (view: Pick<FeudViewModel, 'teams'>, side: Side, index: number): string =>
  displayName(view.teams[side].players[index], index);

/** The podium position that faces off this round (rules, Main game 2). */
export const faceOffIndex = (view: FeudViewModel, side: Side): number =>
  (Math.max(view.audience.round, 1) - 1) % Math.max(1, view.audience.families[side].podiumSize);

export const multiplierLabel = (multiplier: number, suddenDeath: boolean): string => {
  if (suddenDeath) return 'SUDDEN DEATH x3';
  if (multiplier === 2) return 'DOUBLE POINTS';
  if (multiplier === 3) return 'TRIPLE POINTS';
  return 'SINGLE POINTS';
};
