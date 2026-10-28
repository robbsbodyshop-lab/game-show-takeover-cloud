import { describe, expect, it, vi } from 'vitest';
import type { AudioPlayer } from '@/audio/player';
import { PUZZLE_SFX_CUES } from './cues';
import { createPuzzleAudio } from './puzzleAudio';

const fakePlayer = () => {
  const player = {
    play: vi.fn(),
    loop: vi.fn(),
    stopLoop: vi.fn(),
    preload: vi.fn(() => Promise.resolve()),
  };
  return { player, audio: createPuzzleAudio(player as unknown as AudioPlayer) };
};

describe('createPuzzleAudio', () => {
  it('plays effects through the shared player, letting them overlap', () => {
    const { player, audio } = fakePlayer();
    audio.play('puzzle-lock');
    expect(player.play).toHaveBeenCalledWith('puzzle-lock', { overlap: true });
  });

  it('loops music and stops both loops together', () => {
    const { player, audio } = fakePlayer();
    audio.startMusic('puzzle-music-b');
    expect(player.loop).toHaveBeenCalledWith('puzzle-music-b');
    audio.stopMusic();
    expect(player.stopLoop).toHaveBeenCalledWith('puzzle-music-a');
    expect(player.stopLoop).toHaveBeenCalledWith('puzzle-music-b');
  });

  it('preloads the effects but not the long loops', () => {
    const { player, audio } = fakePlayer();
    audio.preload();
    expect(player.preload).toHaveBeenCalledWith(...PUZZLE_SFX_CUES);
  });
});
