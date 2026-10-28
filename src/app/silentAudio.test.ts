import { describe, expect, it } from 'vitest';
import { createSilentAudio } from './silentAudio';

describe('createSilentAudio', () => {
  it('answers every player method with a no-op', () => {
    const audio = createSilentAudio();
    expect(() => {
      audio.stopAll();
      audio.pauseAll();
    }).not.toThrow();
  });
});
