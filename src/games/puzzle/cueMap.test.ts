import { describe, expect, it } from 'vitest';
import type { Capsule, PuzzleEvent } from '@/engines/puzzle';
import { cuesForEvent } from './cueMap';

const capsule: Capsule = { row: 0, col: 3, orientation: 'h', colors: [1, 2] };

describe('cuesForEvent', () => {
  it('stays silent for spawns and gravity steps but clicks for the player moves', () => {
    expect(cuesForEvent({ type: 'spawn', seq: 1, player: 0, capsule }, '1p')).toEqual([]);
    expect(cuesForEvent({ type: 'move', seq: 2, player: 0, dir: 'down', auto: true, capsule }, '1p')).toEqual(
      [],
    );
    expect(
      cuesForEvent({ type: 'move', seq: 3, player: 0, dir: 'left', auto: false, capsule }, '1p'),
    ).toEqual(['puzzle-move']);
  });

  it('maps rotate, lock, fall, clear and germ clears', () => {
    const cases: [PuzzleEvent, string][] = [
      [{ type: 'rotate', seq: 1, player: 0, dir: 'cw', capsule }, 'puzzle-rotate'],
      [{ type: 'lock', seq: 1, player: 0, cells: [], hard: false }, 'puzzle-lock'],
      [{ type: 'fall', seq: 1, player: 0 }, 'puzzle-fall'],
      [{ type: 'clear', seq: 1, player: 0, cells: [], cascadeIndex: 0 }, 'puzzle-clear'],
      [{ type: 'germ-cleared', seq: 1, player: 0, count: 1, points: 100, germsLeft: 3 }, 'puzzle-germ-clear'],
      [{ type: 'level-clear', seq: 1, player: 0, level: 1, bonus: 1000 }, 'puzzle-level-clear'],
      [{ type: 'top-out', seq: 1, player: 0 }, 'puzzle-top-out'],
      [{ type: 'garbage-sent', seq: 1, player: 0, to: 1, colors: [1] }, 'puzzle-garbage-send'],
      [{ type: 'garbage-received', seq: 1, player: 1, colors: [1], columns: [2] }, 'puzzle-garbage-land'],
      [{ type: 'match-won', seq: 1, player: 0 }, 'puzzle-match-win'],
      [{ type: 'paused', seq: 1 }, 'puzzle-pause'],
      [{ type: 'resumed', seq: 1 }, 'puzzle-resume'],
    ];
    for (const [event, cue] of cases) expect(cuesForEvent(event, '2p'), event.type).toEqual([cue]);
  });

  it('raises the cascade pitch with the chain index', () => {
    expect(cuesForEvent({ type: 'cascade', seq: 1, player: 0, index: 1 }, '1p')).toEqual([
      'puzzle-cascade-1',
    ]);
    expect(cuesForEvent({ type: 'cascade', seq: 1, player: 0, index: 3 }, '1p')).toEqual([
      'puzzle-cascade-3',
    ]);
    expect(cuesForEvent({ type: 'cascade', seq: 1, player: 0, index: 7 }, '1p')).toEqual([
      'puzzle-cascade-4',
    ]);
  });

  it('plays the round-win cue only in 2P (1P already plays level-clear)', () => {
    const won: PuzzleEvent = { type: 'round-won', seq: 1, player: 0, round: 1 };
    expect(cuesForEvent(won, '2p')).toEqual(['puzzle-round-win']);
    expect(cuesForEvent(won, '1p')).toEqual([]);
  });
});
