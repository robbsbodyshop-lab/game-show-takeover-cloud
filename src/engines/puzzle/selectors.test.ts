import { describe, expect, it } from 'vitest';
import { reducePuzzle } from './puzzleEngine';
import {
  boardView,
  eventsSince,
  hud,
  isMatchOver,
  isRoundOver,
  winnerOfMatch,
  winnerOfRound,
} from './selectors';
import { newGame, parseBoard, player, setup, tick } from './testHelpers';

describe('selectors', () => {
  it('boardView overlays the live capsule on the locked board', () => {
    const s = setup(newGame(), 0, parseBoard(['....A...']), {
      row: 3,
      col: 2,
      orientation: 'v',
      colors: [2, 3],
    });
    const view = boardView(player(s, 0));
    expect(view).toHaveLength(16);
    expect(view[0]).toHaveLength(8);
    expect(view[3]?.[2]).toEqual({ kind: 'half', color: 2, partnerDir: 'up', active: true });
    expect(view[2]?.[2]).toEqual({ kind: 'half', color: 3, partnerDir: 'down', active: true });
    expect(view[15]?.[4]).toEqual({ kind: 'germ', color: 1 });
    expect(view[10]?.[0]).toEqual({ kind: 'empty' });
  });

  it('hud reports level, speed, score, germs and the next preview', () => {
    const s = newGame({ levels: [9, 9], speeds: ['hi', 'hi'] });
    const h = hud(player(s, 0));
    expect(h).toMatchObject({
      level: 9,
      speed: 'hi',
      score: 0,
      germsLeft: 9,
      germsStart: 9,
      status: 'playing',
    });
    expect(h.next).toEqual(player(s, 0).next);
  });

  it('round helpers follow the match status', () => {
    let s = setup(newGame(), 0, parseBoard(['AAA.....']), {
      row: 15,
      col: 3,
      orientation: 'v',
      colors: [1, 2],
    });
    expect(isRoundOver(s)).toBe(false);
    expect(winnerOfRound(s)).toBeNull();
    s = tick(tick(s, 1000), 1000);
    expect(isRoundOver(s)).toBe(true);
    expect(isMatchOver(s)).toBe(false);
    expect(winnerOfRound(s)).toBe(0);
    expect(winnerOfMatch(s)).toBeNull();
    s = reducePuzzle(s, { type: 'NEXT_ROUND' });
    expect(isRoundOver(s)).toBe(false);
  });

  it('eventsSince filters by seq', () => {
    const s = tick(newGame(), 2000);
    const all = eventsSince(s, 0);
    expect(all.length).toBe(s.events.length);
    expect(eventsSince(s, s.nextSeq - 1)).toEqual([]);
  });
});
