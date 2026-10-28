import { describe, expect, it } from 'vitest';
import { isStartKey, matchIntent, menuIntent } from './keys';

describe('keys', () => {
  it('maps WASD and Space to player 1 and the arrows and Enter to player 2 in menus', () => {
    expect(menuIntent({ key: 'w' }, false)).toEqual({ kind: 'nav', player: 0, dir: 'up' });
    expect(menuIntent({ key: 'D' }, false)).toEqual({ kind: 'nav', player: 0, dir: 'right' });
    expect(menuIntent({ key: ' ' }, false)).toEqual({ kind: 'confirm', player: 0 });
    expect(menuIntent({ key: 'ArrowLeft' }, false)).toEqual({ kind: 'nav', player: 1, dir: 'left' });
    expect(menuIntent({ key: 'Enter' }, false)).toEqual({ kind: 'confirm', player: 1 });
    expect(menuIntent({ key: 'Escape' }, false)).toEqual({ kind: 'back' });
    expect(menuIntent({ key: 'x' }, false)).toBeNull();
  });

  it('lets the arrows and Enter drive player 1 when only one player is in', () => {
    expect(menuIntent({ key: 'ArrowDown' }, true)).toEqual({ kind: 'nav', player: 0, dir: 'down' });
    expect(menuIntent({ key: 'Enter' }, true)).toEqual({ kind: 'confirm', player: 0 });
  });

  it('maps match keys per player', () => {
    expect(matchIntent({ key: 'a' }, 2)).toEqual({ kind: 'move', player: 0, input: 'left' });
    expect(matchIntent({ key: 'w' }, 2)).toEqual({ kind: 'move', player: 0, input: 'rotate-cw' });
    expect(matchIntent({ key: 'q' }, 2)).toEqual({ kind: 'move', player: 0, input: 'rotate-ccw' });
    expect(matchIntent({ key: ' ' }, 2)).toEqual({ kind: 'move', player: 0, input: 'hard-drop' });
    expect(matchIntent({ key: 'ArrowRight' }, 2)).toEqual({ kind: 'move', player: 1, input: 'right' });
    expect(matchIntent({ key: 'ArrowUp' }, 2)).toEqual({ kind: 'move', player: 1, input: 'rotate-cw' });
    expect(matchIntent({ key: 'Enter' }, 2)).toEqual({ kind: 'move', player: 1, input: 'hard-drop' });
    expect(matchIntent({ key: 'ArrowRight' }, 1)).toEqual({ kind: 'move', player: 0, input: 'right' });
    expect(matchIntent({ key: 'p' }, 1)).toEqual({ kind: 'pause' });
    expect(matchIntent({ key: 'Escape' }, 1)).toEqual({ kind: 'pause' });
  });

  it('treats Enter and Space as Start', () => {
    expect(isStartKey({ key: 'Enter' })).toBe(true);
    expect(isStartKey({ key: ' ' })).toBe(true);
    expect(isStartKey({ key: 'a' })).toBe(false);
  });
});
