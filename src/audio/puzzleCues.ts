/**
 * Cue names and files for the puzzle game ("Capsule Clinic"). Data only, so the audio registry can
 * include them without depending on the game module. The WAV files are written by
 * `scripts/generate-puzzle-cues.ts` into `public/audio/puzzle/`.
 */
export const PUZZLE_SFX_CUES = [
  'puzzle-move',
  'puzzle-rotate',
  'puzzle-lock',
  'puzzle-fall',
  'puzzle-clear',
  'puzzle-germ-clear',
  'puzzle-cascade-1',
  'puzzle-cascade-2',
  'puzzle-cascade-3',
  'puzzle-cascade-4',
  'puzzle-garbage-send',
  'puzzle-garbage-land',
  'puzzle-top-out',
  'puzzle-round-win',
  'puzzle-match-win',
  'puzzle-level-clear',
  'puzzle-game-over',
  'puzzle-pause',
  'puzzle-resume',
  'puzzle-hover',
  'puzzle-select',
] as const;

export const PUZZLE_MUSIC_CUES = ['puzzle-music-a', 'puzzle-music-b'] as const;

export const PUZZLE_CUE_NAMES = [...PUZZLE_SFX_CUES, ...PUZZLE_MUSIC_CUES] as const;

export type PuzzleCue = (typeof PUZZLE_CUE_NAMES)[number];
export type PuzzleMusicCue = (typeof PUZZLE_MUSIC_CUES)[number];

/** Cue name to URL under `public/`. */
export const PUZZLE_SOUND_FILES: Readonly<Record<PuzzleCue, string>> = Object.fromEntries(
  PUZZLE_CUE_NAMES.map((name) => [name, `/audio/puzzle/${name}.wav`]),
) as Record<PuzzleCue, string>;
