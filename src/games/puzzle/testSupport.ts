/** Shared helpers for the puzzle tests: a manual frame scheduler and a recording audio fake. */
import { vi } from 'vitest';
import type { FrameScheduler } from './controller';
import type { PuzzleCue, PuzzleMusicCue } from './cues';
import type { PuzzleAudio } from './puzzleAudio';

/** Frames only run when the test advances time; callbacks get a rising timestamp like rAF does. */
export class FakeFrames implements FrameScheduler {
  now = 1000;
  private nextId = 1;
  private queue = new Map<number, (time: number) => void>();

  request = (callback: (time: number) => void): number => {
    const id = this.nextId++;
    this.queue.set(id, callback);
    return id;
  };

  cancel = (id: number): void => {
    this.queue.delete(id);
  };

  get pending(): number {
    return this.queue.size;
  }

  /** Run one frame `ms` after the previous one. */
  frame(ms: number): void {
    this.now += ms;
    const callbacks = [...this.queue.values()];
    this.queue.clear();
    for (const callback of callbacks) callback(this.now);
  }

  /** Run frames of `step` ms until `ms` has passed. */
  advance(ms: number, step = 16): void {
    let left = ms;
    while (left > 0) {
      const dt = Math.min(step, left);
      this.frame(dt);
      left -= dt;
    }
  }
}

export interface FakeAudio extends PuzzleAudio {
  plays: PuzzleCue[];
  music: (PuzzleMusicCue | 'stop')[];
  count(cue: PuzzleCue): number;
}

export const fakeAudio = (): FakeAudio => {
  const plays: PuzzleCue[] = [];
  const music: (PuzzleMusicCue | 'stop')[] = [];
  return {
    plays,
    music,
    count: (cue) => plays.filter((c) => c === cue).length,
    play: vi.fn((cue: PuzzleCue) => {
      plays.push(cue);
    }),
    startMusic: vi.fn((cue: PuzzleMusicCue) => {
      music.push(cue);
    }),
    stopMusic: vi.fn(() => {
      music.push('stop');
    }),
    preload: vi.fn(),
  };
};
