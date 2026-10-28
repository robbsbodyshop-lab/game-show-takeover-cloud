import { PlinkoScreen } from '@/games/plinko';
import { SpeedRound } from '@/games/speed';
import { WinnerScreen } from '@/games/winner';
import type { StageRegistry } from '@/stage/screenContract';
import { PuzzleScreen } from './PuzzleScreen';

/**
 * Everything the stage renders but does not own (design.md §6: `stage/` composes, `games/` never
 * import the stage). Family Feud and Wheel of Fortune are added here when their UIs land.
 */
export const stageRegistry: StageRegistry = {
  games: {},
  screens: {
    speed: SpeedRound,
    plinko: PlinkoScreen,
    winner: WinnerScreen,
    puzzle: PuzzleScreen,
  },
};
