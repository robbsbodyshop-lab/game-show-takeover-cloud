import { PuzzleGame } from '@/games/puzzle/PuzzleGame';
import type { EventScreenProps } from '@/stage/screenContract';

/** The puzzle game runs on its own engine, not the event session: adapt the stage's screen props. */
export const PuzzleScreen = ({ inputLocked, showMode, audio, onBackToHub }: EventScreenProps) => (
  <PuzzleGame inputLocked={inputLocked} showMode={showMode} audio={audio} onQuitToHub={onBackToHub} />
);
