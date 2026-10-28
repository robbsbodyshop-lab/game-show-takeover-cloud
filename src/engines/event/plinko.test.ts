import { describe, expect, it } from 'vitest';
import { eventReducer } from './eventReducer';
import {
  PLINKO_ROWS,
  PLINKO_SLOT_COUNT,
  PLINKO_SLOT_VALUES,
  createPlinkoState,
  dropPath,
  recordDrop,
  selectColumn,
  selectedColumn,
} from './plinko';
import { plinkoFinished } from './selectors';
import { DRAW_8, hubSession, run, teamChips, teamScore } from './testHelpers';

describe('board constants', () => {
  it('has 9 slots worth 100,200,300,500,1000,500,300,200,100 and 8 rows', () => {
    expect(PLINKO_SLOT_VALUES).toEqual([100, 200, 300, 500, 1000, 500, 300, 200, 100]);
    expect(PLINKO_SLOT_COUNT).toBe(9);
    expect(PLINKO_ROWS).toBe(8);
  });
});

describe('dropPath', () => {
  it('is deterministic', () => {
    expect(dropPath(4, DRAW_8)).toEqual(dropPath(4, [...DRAW_8]));
  });

  it('all-left walks to the left wall, all-right to the right wall', () => {
    expect(dropPath(4, Array<number>(8).fill(0))?.slot).toBe(0);
    expect(dropPath(4, Array<number>(8).fill(0.99))?.slot).toBe(8);
    expect(dropPath(0, Array<number>(8).fill(0))?.slot).toBe(0);
    expect(dropPath(8, Array<number>(8).fill(0.99))?.slot).toBe(8);
  });

  it('a balanced walk returns to the starting column', () => {
    const balanced = [0.1, 0.9, 0.1, 0.9, 0.1, 0.9, 0.1, 0.9];
    for (let c = 1; c <= 7; c++) expect(dropPath(c, balanced)?.slot).toBe(c);
  });

  it('draw 0.5 goes right and just below goes left', () => {
    expect(dropPath(4, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5])?.steps).toEqual(Array(8).fill(1));
    expect(dropPath(4, [0.4999, 0, 0, 0, 0, 0, 0, 0])?.steps[0]).toBe(-1);
  });

  it('stays in bounds for every column and a sweep of draws', () => {
    let seed = 12345;
    const rnd = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let c = 0; c < PLINKO_SLOT_COUNT; c++) {
      for (let k = 0; k < 300; k++) {
        const path = dropPath(
          c,
          Array.from({ length: 8 }, () => rnd()),
        );
        expect(path).not.toBeNull();
        expect(path?.slot).toBeGreaterThanOrEqual(0);
        expect(path?.slot).toBeLessThanOrEqual(8);
        expect(path?.xs).toHaveLength(8);
        for (const x of path?.xs ?? []) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(16);
        }
      }
    }
  });

  it('every slot is reachable from the centre column', () => {
    const slots = new Set<number>();
    for (let mask = 0; mask < 256; mask++) {
      const draw = Array.from({ length: 8 }, (_, i) => ((mask >> i) & 1 ? 0.75 : 0.25));
      slots.add(dropPath(4, draw)?.slot ?? -1);
    }
    expect([...slots].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('rejects bad columns and draws', () => {
    expect(dropPath(-1, DRAW_8)).toBeNull();
    expect(dropPath(9, DRAW_8)).toBeNull();
    expect(dropPath(1.5, DRAW_8)).toBeNull();
    expect(dropPath(4, DRAW_8.slice(0, 7))).toBeNull();
    expect(dropPath(4, [...DRAW_8, 0.5])).toBeNull();
    expect(dropPath(4, [...DRAW_8.slice(0, 7), 1])).toBeNull();
    expect(dropPath(4, [...DRAW_8.slice(0, 7), Number.NaN])).toBeNull();
  });
});

describe('plinko state helpers', () => {
  it('selects, replaces and clears a column', () => {
    let p = createPlinkoState();
    p = selectColumn(p, 2, 5);
    expect(selectedColumn(p, 2)).toBe(5);
    expect(selectColumn(p, 2, 5)).toBe(p);
    p = selectColumn(p, 2, 6);
    expect(p.selections).toEqual([{ team: 2, column: 6 }]);
    expect(selectColumn(p, 2, 9)).toBe(p);
    p = recordDrop(p, { team: 2, column: 6, xs: [], slot: 3, points: 500 });
    expect(selectedColumn(p, 2)).toBeNull();
    expect(p.drops).toHaveLength(1);
  });
});

describe('plinko through the reducer', () => {
  const ready = () => {
    let s = hubSession(3);
    s = run(
      s,
      { type: 'CHIP_CHANGE', team: 1, delta: 2 },
      { type: 'CHIP_CHANGE', team: 2, delta: 1 },
      { type: 'START_PLINKO' },
    );
    return s;
  };

  it('START_PLINKO is hub-only', () => {
    const s = ready();
    expect(s.phase).toBe('plinko');
    expect(eventReducer(s, { type: 'START_PLINKO' })).toBe(s);
    const setup = run(hubSession(3), { type: 'NEW_EVENT' });
    expect(eventReducer(setup, { type: 'START_PLINKO' })).toBe(setup);
  });

  it('a drop spends exactly one chip and adds the slot value', () => {
    let s = ready();
    s = run(s, { type: 'PLINKO_SELECT_COLUMN', team: 1, column: 4 });
    const expectedSlot = dropPath(4, DRAW_8)?.slot ?? -1;
    s = eventReducer(s, { type: 'PLINKO_DROP', team: 1, draw: DRAW_8 });
    expect(teamChips(s, 1)).toBe(1);
    expect(teamScore(s, 1)).toBe(PLINKO_SLOT_VALUES[expectedSlot]);
    expect(s.plinko?.drops).toHaveLength(1);
    expect(s.plinko?.drops[0]).toMatchObject({ team: 1, column: 4, slot: expectedSlot });
  });

  it('needs a selected column, a chip and a valid draw', () => {
    const s = ready();
    expect(eventReducer(s, { type: 'PLINKO_DROP', team: 1, draw: DRAW_8 })).toBe(s); // no column
    const sel = run(s, { type: 'PLINKO_SELECT_COLUMN', team: 3, column: 4 });
    expect(eventReducer(sel, { type: 'PLINKO_DROP', team: 3, draw: DRAW_8 })).toBe(sel); // no chips
    const sel1 = run(s, { type: 'PLINKO_SELECT_COLUMN', team: 1, column: 4 });
    expect(eventReducer(sel1, { type: 'PLINKO_DROP', team: 1, draw: [0.1] })).toBe(sel1);
    expect(eventReducer(sel1, { type: 'PLINKO_DROP', team: 9, draw: DRAW_8 })).toBe(sel1);
  });

  it('column selection is illegal for unknown teams, bad columns and outside plinko', () => {
    const s = ready();
    expect(eventReducer(s, { type: 'PLINKO_SELECT_COLUMN', team: 9, column: 1 })).toBe(s);
    expect(eventReducer(s, { type: 'PLINKO_SELECT_COLUMN', team: 1, column: 9 })).toBe(s);
    const hub = hubSession(3);
    expect(eventReducer(hub, { type: 'PLINKO_SELECT_COLUMN', team: 1, column: 1 })).toBe(hub);
    expect(eventReducer(hub, { type: 'PLINKO_DROP', team: 1, draw: DRAW_8 })).toBe(hub);
  });

  it('each chip needs a fresh column choice', () => {
    let s = ready();
    s = run(
      s,
      { type: 'PLINKO_SELECT_COLUMN', team: 1, column: 2 },
      { type: 'PLINKO_DROP', team: 1, draw: DRAW_8 },
    );
    expect(eventReducer(s, { type: 'PLINKO_DROP', team: 1, draw: DRAW_8 })).toBe(s);
  });

  it('is finished when all chips are used, and END_PLINKO returns to the hub (also when host ends early)', () => {
    let s = ready();
    expect(plinkoFinished(s)).toBe(false);
    for (const team of [1, 1, 2]) {
      s = run(
        s,
        { type: 'PLINKO_SELECT_COLUMN', team, column: 4 },
        { type: 'PLINKO_DROP', team, draw: DRAW_8 },
      );
    }
    expect(plinkoFinished(s)).toBe(true);
    const ended = eventReducer(s, { type: 'END_PLINKO' });
    expect(ended.phase).toBe('hub');
    expect(ended.plinko).toBeNull();
    const early = eventReducer(ready(), { type: 'END_PLINKO' });
    expect(early.phase).toBe('hub');
    expect(eventReducer(ended, { type: 'END_PLINKO' })).toBe(ended);
  });

  it('uses slot values from settings', () => {
    let s = ready();
    s = { ...s, settings: { ...s.settings, plinkoSlotValues: [1, 2, 3, 4, 5, 6, 7, 8, 9] } };
    const slot = dropPath(4, DRAW_8)?.slot ?? -1;
    s = run(
      s,
      { type: 'PLINKO_SELECT_COLUMN', team: 1, column: 4 },
      { type: 'PLINKO_DROP', team: 1, draw: DRAW_8 },
    );
    expect(teamScore(s, 1)).toBe(slot + 1);
  });
});
