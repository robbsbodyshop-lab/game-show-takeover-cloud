/**
 * Adapter between the puzzle game and the shared `AudioPlayer`.
 *
 * `AudioPlayer.play/loop/stopLoop` are typed to `SoundName` and resolve files through the registry in
 * `src/audio/cues.ts`, which this module does not own. The adapter therefore hands our cue names to the
 * shared player unchanged; they only sound once that registry also lists `PUZZLE_SOUND_FILES`
 * (see the T24 report: spread `PUZZLE_SOUND_FILES` into `SOUND_FILES`). Until then the player warns once
 * per cue and stays silent, which never breaks the game.
 */
import type { AudioPlayer } from '@/audio/player';
import type { SoundName } from '@/audio/cues';
import { PUZZLE_MUSIC_CUES, PUZZLE_SFX_CUES } from './cues';
import type { PuzzleCue, PuzzleMusicCue } from './cues';

export interface PuzzleAudio {
  play(cue: PuzzleCue): void;
  startMusic(cue: PuzzleMusicCue): void;
  stopMusic(): void;
  preload(): void;
}

/** Cue names are a different union from `SoundName`; this is the single place that bridges them. */
const asSound = (cue: PuzzleCue): SoundName => cue;

export const createPuzzleAudio = (audio: AudioPlayer): PuzzleAudio => ({
  play: (cue) => {
    audio.play(asSound(cue), { overlap: true });
  },
  startMusic: (cue) => {
    audio.loop(asSound(cue));
  },
  stopMusic: () => {
    for (const cue of PUZZLE_MUSIC_CUES) audio.stopLoop(asSound(cue));
  },
  preload: () => {
    void audio.preload(...PUZZLE_SFX_CUES.map(asSound));
  },
});
