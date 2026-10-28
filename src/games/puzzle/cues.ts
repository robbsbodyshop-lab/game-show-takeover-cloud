/**
 * Cue names for the puzzle game. The names and files live in `src/audio/puzzleCues.ts` so the shared
 * registry (`src/audio/cues.ts`) includes them; this module adds the music choice and cascade helper.
 */

export {
  PUZZLE_CUE_NAMES,
  PUZZLE_MUSIC_CUES,
  PUZZLE_SFX_CUES,
  PUZZLE_SOUND_FILES,
  type PuzzleCue,
  type PuzzleMusicCue,
} from '@/audio/puzzleCues';
import type { PuzzleCue, PuzzleMusicCue } from '@/audio/puzzleCues';

/** The music choice on the setup screen. */
export type MusicChoice = 'a' | 'b' | 'off';

export const MUSIC_CUE: Readonly<Record<Exclude<MusicChoice, 'off'>, PuzzleMusicCue>> = {
  a: 'puzzle-music-a',
  b: 'puzzle-music-b',
};

/** Cascade cue for a step with the given index (1 = first chain link); pitch rises, capped at 4. */
export const cascadeCue = (index: number): PuzzleCue => {
  const n = Math.min(4, Math.max(1, Math.floor(index)));
  return `puzzle-cascade-${n.toString()}` as PuzzleCue;
};
