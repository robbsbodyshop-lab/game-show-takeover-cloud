import { FeudGame } from '@/games/feud/FeudGame';
import { registerFeudConsole } from '@/games/feud/FeudConsole';
import { PlinkoScreen } from '@/games/plinko';
import { SpeedRound } from '@/games/speed';
import { WheelGame, registerWheelConsole } from '@/games/wheel';
import { WinnerScreen } from '@/games/winner';
import type { StageRegistry } from '@/stage/screenContract';
import { PuzzleScreen } from './PuzzleScreen';

/**
 * Everything the stage renders but does not own (design.md §6: `stage/` composes, `games/` never
 * import the stage).
 */
registerFeudConsole();
registerWheelConsole();

export const stageRegistry: StageRegistry = {
  games: { feud: FeudGame, wheel: WheelGame },
  screens: {
    speed: SpeedRound,
    plinko: PlinkoScreen,
    winner: WinnerScreen,
    puzzle: PuzzleScreen,
  },
};
