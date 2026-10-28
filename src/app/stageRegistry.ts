import { FeudGame } from '@/games/feud/FeudGame';
import { registerFeudConsole } from '@/games/feud/FeudConsole';
import { PlinkoScreen } from '@/games/plinko';
import { SpeedRound } from '@/games/speed';
import { WinnerScreen } from '@/games/winner';
import type { StageRegistry } from '@/stage/screenContract';
import { PuzzleScreen } from './PuzzleScreen';

/**
 * Everything the stage renders but does not own (design.md §6: `stage/` composes, `games/` never
 * import the stage). Wheel of Fortune is added here when its UI lands.
 */
registerFeudConsole();

export const stageRegistry: StageRegistry = {
  games: { feud: FeudGame },
  screens: {
    speed: SpeedRound,
    plinko: PlinkoScreen,
    winner: WinnerScreen,
    puzzle: PuzzleScreen,
  },
};
