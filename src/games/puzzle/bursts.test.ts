import { describe, expect, it } from 'vitest';
import type { PuzzleEvent } from '@/engines/puzzle';
import { BURST_FRAMES, BURST_FRAME_MS, BurstTracker } from './bursts';

const clear = (seq: number): PuzzleEvent => ({
  type: 'clear',
  seq,
  player: 1,
  cascadeIndex: 0,
  cells: [
    { row: 15, col: 2, color: 1, germ: true },
    { row: 15, col: 3, color: 2, germ: false },
  ],
});

describe('BurstTracker', () => {
  it('starts a burst per cleared cell and steps through four frames', () => {
    const t = new BurstTracker();
    t.add([clear(1)], 1000);
    expect(t.active(1000).map((b) => b.frame)).toEqual([1, 1]);
    expect(t.active(1000 + BURST_FRAME_MS).map((b) => b.frame)).toEqual([2, 2]);
    expect(t.active(1000 + BURST_FRAME_MS * 3).map((b) => b.frame)).toEqual([4, 4]);
    expect(t.active(1000 + BURST_FRAME_MS * BURST_FRAMES)).toEqual([]);
  });

  it('carries the cell, colour, player and germ flag', () => {
    const t = new BurstTracker();
    t.add([clear(1)], 0);
    expect(t.active(0)[0]).toMatchObject({ player: 1, row: 15, col: 2, color: 1, germ: true });
  });

  it('ignores other events and can be cleared', () => {
    const t = new BurstTracker();
    t.add([{ type: 'fall', seq: 1, player: 0 }], 0);
    expect(t.active(0)).toEqual([]);
    t.add([clear(2)], 0);
    t.clear();
    expect(t.active(0)).toEqual([]);
  });
});
