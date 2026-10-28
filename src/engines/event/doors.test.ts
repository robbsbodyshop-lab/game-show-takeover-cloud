import { describe, expect, it } from 'vitest';
import { createDoors, doorPositions, pickDoor, revealDoors } from './doors';
import { eventReducer } from './eventReducer';
import { run, session } from './testHelpers';

describe('doorPositions', () => {
  it('is a permutation of 1..n for any draw', () => {
    for (let n = 3; n <= 8; n++) {
      const draw = Array.from({ length: n }, (_, i) => ((i + 1) * 0.137) % 1);
      const p = doorPositions(draw, n);
      expect([...(p ?? [])].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    }
  });

  it('is deterministic', () => {
    const draw = [0.5, 0.25, 0.75, 0.1];
    expect(doorPositions(draw, 4)).toEqual(doorPositions([...draw], 4));
  });

  it('known values: all-zero draw rotates, all-max draw keeps identity', () => {
    expect(doorPositions([0, 0, 0, 0], 4)).toEqual([2, 3, 4, 1]);
    expect(doorPositions([0.99, 0.99, 0.99, 0.99], 4)).toEqual([1, 2, 3, 4]);
  });

  it('different draws can give different permutations', () => {
    const seen = new Set<string>();
    for (let k = 0; k < 20; k++) {
      const draw = [k / 20, ((k * 7) % 20) / 20, ((k * 3) % 20) / 20, ((k * 11) % 20) / 20];
      seen.add(JSON.stringify(doorPositions(draw, 4)));
    }
    expect(seen.size).toBeGreaterThan(5);
  });

  it('rejects short or out-of-range draws', () => {
    expect(doorPositions([0.1, 0.2], 4)).toBeNull();
    expect(doorPositions([0.1, 1, 0.3, 0.2], 4)).toBeNull();
    expect(doorPositions([0.1, -0.1, 0.3, 0.2], 4)).toBeNull();
    expect(doorPositions([0.1, Number.NaN, 0.3, 0.2], 4)).toBeNull();
  });
});

describe('pickDoor / revealDoors', () => {
  const ids = [1, 2, 3];

  it('moves picking -> revealing when the last team picks', () => {
    let d = createDoors(3);
    d = pickDoor(d, ids, 1, 2);
    d = pickDoor(d, ids, 2, 3);
    expect(d.stage).toBe('picking');
    d = pickDoor(d, ids, 3, 1);
    expect(d.stage).toBe('revealing');
  });

  it('rejects duplicate doors, unknown teams and out-of-range doors', () => {
    let d = createDoors(3);
    d = pickDoor(d, ids, 1, 2);
    expect(pickDoor(d, ids, 2, 2)).toBe(d);
    expect(pickDoor(d, ids, 9, 1)).toBe(d);
    expect(pickDoor(d, ids, 2, 4)).toBe(d);
    expect(pickDoor(d, ids, 2, 0)).toBe(d);
    expect(pickDoor(d, ids, 2, 1.5)).toBe(d);
  });

  it('lets a team move its own pick while picking, and re-pick of the same door is a no-op', () => {
    let d = createDoors(3);
    d = pickDoor(d, ids, 1, 2);
    expect(pickDoor(d, ids, 1, 2)).toBe(d);
    const moved = pickDoor(d, ids, 1, 3);
    expect(moved.picks).toEqual([{ team: 1, door: 3 }]);
  });

  it('refuses picks once revealing and reveals only from revealing', () => {
    let d = createDoors(3);
    expect(revealDoors(d, [0.1, 0.2, 0.3])).toBeNull();
    d = pickDoor(pickDoor(pickDoor(d, ids, 1, 1), ids, 2, 2), ids, 3, 3);
    expect(pickDoor(d, ids, 1, 2)).toBe(d);
    const r = revealDoors(d, [0, 0, 0]);
    expect(r?.doors.stage).toBe('done');
    expect(r?.doors.positions).toEqual([2, 3, 1]);
    // door 1 -> position 2, door 2 -> position 3, door 3 -> position 1: order is team 3, 1, 2
    expect(r?.playOrder).toEqual([3, 1, 2]);
    expect(revealDoors(r?.doors ?? d, [0, 0, 0])).toBeNull();
  });
});

describe('doors through the reducer', () => {
  const start = (): ReturnType<typeof session> => run(session(3), { type: 'START_DOORS' });

  it('picking, reveal, then GO_HUB with the play order set', () => {
    let s = start();
    expect(s.phase).toBe('doors');
    expect(s.doors?.stage).toBe('picking');
    s = run(
      s,
      { type: 'DOOR_PICK', team: 1, door: 3 },
      { type: 'DOOR_PICK', team: 2, door: 1 },
      { type: 'DOOR_PICK', team: 3, door: 2 },
    );
    expect(s.doors?.stage).toBe('revealing');
    expect(eventReducer(s, { type: 'GO_HUB' })).toBe(s); // cannot skip the reveal
    s = eventReducer(s, { type: 'DOORS_REVEAL', draw: [0.99, 0.99, 0.99] });
    expect(s.doors?.stage).toBe('done');
    expect(s.playOrder).toEqual([2, 3, 1]); // identity positions: door 1 first (team 2), door 2 (team 3), door 3 (team 1)
    s = eventReducer(s, { type: 'GO_HUB' });
    expect(s.phase).toBe('hub');
    expect(s.doors).toBeNull();
  });

  it('is illegal outside the doors phase and with bad draws', () => {
    const setup = session(3);
    expect(eventReducer(setup, { type: 'DOOR_PICK', team: 1, door: 1 })).toBe(setup);
    expect(eventReducer(setup, { type: 'DOORS_REVEAL', draw: [0, 0, 0] })).toBe(setup);
    const s = start();
    expect(eventReducer(s, { type: 'DOORS_REVEAL', draw: [0, 0, 0] })).toBe(s); // not revealing yet
    expect(eventReducer(s, { type: 'START_DOORS' })).toBe(s);
  });

  it('needs 3+ teams', () => {
    const two = session(2);
    expect(eventReducer(two, { type: 'START_DOORS' })).toBe(two);
  });
});
