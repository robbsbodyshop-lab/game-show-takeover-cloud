import { describe, expect, it } from 'vitest';
import { allReady, createSetup, reduceSetup, rowsFor } from './setup';
import type { SetupState } from './setup';

const move = (s: SetupState, player: number, dir: 'up' | 'down' | 'left' | 'right'): SetupState =>
  reduceSetup(s, { type: 'move', player, dir });
const press = (s: SetupState, player: number): SetupState => reduceSetup(s, { type: 'press', player });

describe('setup reducer', () => {
  it('starts on level 1 / low with the cursor on the level tile', () => {
    const s = createSetup('1p');
    expect(s.players).toEqual([{ level: 1, speed: 'low', ready: false, row: 0, col: 0 }]);
    expect(s.music).toBe('a');
  });

  it('gives player 1 a music row and player 2 none', () => {
    expect(rowsFor(0)).toContain('music');
    expect(rowsFor(1)).not.toContain('music');
  });

  it('moves the cursor without wrapping and picks a level with press', () => {
    let s = createSetup('1p');
    s = move(s, 0, 'left');
    expect(s.players[0]?.col).toBe(0);
    for (let i = 0; i < 4; i++) s = move(s, 0, 'right');
    s = press(s, 0);
    expect(s.players[0]?.level).toBe(5);
    s = move(s, 0, 'down');
    s = press(s, 0);
    expect(s.players[0]?.level).toBe(15);
    expect(s.players[0]?.row).toBe(1);
  });

  it('lands on the current value when entering the speed and music rows', () => {
    let s = createSetup('1p');
    s = move(move(s, 0, 'down'), 0, 'down');
    expect(s.players[0]).toMatchObject({ row: 2, col: 0 });
    s = move(s, 0, 'right');
    s = press(s, 0);
    expect(s.players[0]?.speed).toBe('med');
    s = move(s, 0, 'down');
    expect(s.players[0]?.col).toBe(0);
    s = move(s, 0, 'right');
    s = move(s, 0, 'right');
    s = press(s, 0);
    expect(s.music).toBe('off');
  });

  it('returns the same object for moves that change nothing (illegal action rule)', () => {
    const s = createSetup('1p');
    expect(move(s, 0, 'up')).toBe(s);
    expect(reduceSetup(s, { type: 'move', player: 5, dir: 'down' })).toBe(s);
    expect(reduceSetup(s, { type: 'unready', player: 0 })).toBe(s);
  });

  it('readies on START, locks the cursor, and unreadies', () => {
    let s = createSetup('1p');
    for (let i = 0; i < 4; i++) s = move(s, 0, 'down');
    s = press(s, 0);
    expect(allReady(s)).toBe(true);
    const locked = move(s, 0, 'up');
    expect(locked).toBe(s);
    s = reduceSetup(s, { type: 'unready', player: 0 });
    expect(allReady(s)).toBe(false);
  });

  it('needs both players ready in 2P and keeps their choices separate', () => {
    let s = createSetup('2p');
    s = move(s, 1, 'right');
    s = press(s, 1);
    expect(s.players.map((p) => p.level)).toEqual([1, 2]);
    for (let i = 0; i < 4; i++) s = move(s, 0, 'down');
    s = press(s, 0);
    expect(allReady(s)).toBe(false);
    for (let i = 0; i < 3; i++) s = move(s, 1, 'down');
    s = press(s, 1);
    expect(allReady(s)).toBe(true);
  });

  it('click selects a tile for that player, ignoring bad coordinates', () => {
    const s = createSetup('2p');
    const clicked = reduceSetup(s, { type: 'click', player: 1, row: 1, col: 9 });
    expect(clicked.players[1]?.level).toBe(20);
    expect(reduceSetup(s, { type: 'click', player: 1, row: 9, col: 0 })).toBe(s);
    expect(reduceSetup(s, { type: 'click', player: 1, row: 2, col: 3 })).toBe(s);
  });

  it('keeps earlier choices when the setup is recreated', () => {
    const first = press(move(createSetup('1p'), 0, 'right'), 0);
    const again = createSetup('2p', first);
    expect(again.players[0]?.level).toBe(2);
    expect(again.players).toHaveLength(2);
  });
});
