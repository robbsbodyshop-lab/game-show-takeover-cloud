import { describe, expect, it } from 'vitest';
import { createEventSession, defaultTeamEdits, eventReducer } from './eventReducer';
import { nextBracketMatch } from './selectors';
import { hubSession, run, session, teamChips, teamScore } from './testHelpers';
import { currentMatch } from './tournament';
import type { EventAction, EventSession } from './types';

const win = (winnerId: number, roundScore = 300, extra: Partial<EventAction> = {}): EventAction =>
  ({ type: 'GAME_WON', winnerId, roundScore, ...extra }) as EventAction;

describe('createEventSession', () => {
  it('starts in setup with two teams, both main games available and nothing used', () => {
    const s = createEventSession();
    expect(s).toMatchObject({
      schemaVersion: 1,
      phase: 'setup',
      availableMainGames: ['feud', 'wheel'],
      completedGames: [],
      usedContentIds: [],
      playOrder: null,
      bracket: null,
      gameInstance: 0,
      game: null,
      doors: null,
      plinko: null,
      speed: null,
    });
    expect(s.teams.map((t) => t.id)).toEqual([1, 2]);
  });
});

describe('SET_TEAMS', () => {
  const edits = (n: number) => defaultTeamEdits(n);

  it('replaces teams in setup and keeps scores by list place', () => {
    let s = run(
      session(3),
      { type: 'SCORE_CHANGE', team: 2, delta: 40 },
      { type: 'CHIP_CHANGE', team: 2, delta: 2 },
    );
    const renamed = edits(3);
    renamed[1] = { name: '  Owls ', color: '#123456', players: [' Ann ', '', 'Bo'] };
    s = eventReducer(s, { type: 'SET_TEAMS', teams: renamed });
    expect(s.teams[1]).toMatchObject({
      id: 2,
      name: 'Owls',
      color: '#123456',
      players: ['Ann', 'Bo'],
      score: 40,
      chips: 2,
    });
  });

  it('rejects fewer than 2 or more than 8 teams, empty names and bad shapes', () => {
    const s = session(3);
    expect(eventReducer(s, { type: 'SET_TEAMS', teams: edits(1) })).toBe(s);
    expect(eventReducer(s, { type: 'SET_TEAMS', teams: edits(9) })).toBe(s);
    const blank = edits(3);
    blank[0] = { name: '   ', color: '#fff', players: [] };
    expect(eventReducer(s, { type: 'SET_TEAMS', teams: blank })).toBe(s);
    const noColor = edits(3);
    noColor[0] = { name: 'A', color: '', players: [] };
    expect(eventReducer(s, { type: 'SET_TEAMS', teams: noColor })).toBe(s);
  });

  it('changing the count in setup clears order and bracket only', () => {
    let s = run(session(4), { type: 'SET_PLAY_ORDER', order: [4, 3, 2, 1] });
    s = eventReducer(s, { type: 'SET_TEAMS', teams: edits(5) });
    expect(s.phase).toBe('setup');
    expect(s.playOrder).toBeNull();
    expect(s.teams).toHaveLength(5);
  });

  it('lowering the count removes the last teams with their scores and chips', () => {
    let s = run(hubSession(4), { type: 'SCORE_CHANGE', team: 4, delta: 90 });
    s = eventReducer(s, { type: 'SET_TEAMS', teams: edits(3) });
    expect(s.teams.map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it('a count change in the hub clears order and bracket and reopens the door game for 3+ teams', () => {
    let s = run(
      hubSession(4),
      { type: 'START_GAME', kind: 'feud', instanceSeed: 1 },
      { type: 'ABANDON_GAME' },
    );
    expect(s.bracket).not.toBeNull();
    s = eventReducer(s, { type: 'SET_TEAMS', teams: edits(5) });
    expect(s.phase).toBe('doors');
    expect(s.doors).toMatchObject({ stage: 'picking', doorCount: 5 });
    expect(s.playOrder).toBeNull();
    expect(s.bracket).toBeNull();
  });

  it('dropping to two teams from the hub stays in the hub with no doors', () => {
    const s = eventReducer(hubSession(3), { type: 'SET_TEAMS', teams: edits(2) });
    expect(s.phase).toBe('hub');
    expect(s.doors).toBeNull();
    expect(s.playOrder).toBeNull();
  });

  it('a rename or recolour keeps order, bracket and phase', () => {
    let s = run(
      hubSession(4),
      { type: 'START_GAME', kind: 'feud', instanceSeed: 1 },
      { type: 'ABANDON_GAME' },
    );
    const e = edits(4);
    e[0] = { name: 'Zed', color: '#000', players: ['x'] };
    const before = s;
    s = eventReducer(s, { type: 'SET_TEAMS', teams: e });
    expect(s.phase).toBe('hub');
    expect(s.playOrder).toBe(before.playOrder);
    expect(s.bracket).toBe(before.bracket);
  });

  it('is illegal while a game runs, in speed, plinko, puzzle and winner', () => {
    const hub = hubSession(3);
    const game = run(hub, { type: 'START_GAME', kind: 'wheel', instanceSeed: 1 });
    expect(eventReducer(game, { type: 'SET_TEAMS', teams: edits(3) })).toBe(game);
    for (const start of ['START_SPEED', 'START_PLINKO', 'START_PUZZLE', 'ANNOUNCE_WINNER'] as const) {
      const s = eventReducer(hub, { type: start });
      expect(eventReducer(s, { type: 'SET_TEAMS', teams: edits(3) })).toBe(s);
    }
  });
});

describe('SET_PLAY_ORDER', () => {
  it('accepts a permutation of team ids in setup and hub', () => {
    const s = eventReducer(session(3), { type: 'SET_PLAY_ORDER', order: [3, 1, 2] });
    expect(s.playOrder).toEqual([3, 1, 2]);
    expect(eventReducer(hubSession(3), { type: 'SET_PLAY_ORDER', order: [2, 3, 1] }).playOrder).toEqual([
      2, 3, 1,
    ]);
  });

  it('rejects non-permutations', () => {
    const s = session(3);
    for (const order of [[1, 2], [1, 2, 2], [1, 2, 4], [1, 2, 3, 4], []]) {
      expect(eventReducer(s, { type: 'SET_PLAY_ORDER', order })).toBe(s);
    }
  });

  it('manual order skips the door game', () => {
    const doors = run(session(3), { type: 'START_DOORS' });
    const s = eventReducer(doors, { type: 'SET_PLAY_ORDER', order: [2, 1, 3] });
    expect(s.phase).toBe('hub');
    expect(s.doors).toBeNull();
  });

  it('is illegal while a game runs and once a bracket exists', () => {
    const game = run(hubSession(3), { type: 'START_GAME', kind: 'feud', instanceSeed: 1 });
    expect(eventReducer(game, { type: 'SET_PLAY_ORDER', order: [3, 2, 1] })).toBe(game);
    const hubWithBracket = eventReducer(game, { type: 'ABANDON_GAME' });
    expect(eventReducer(hubWithBracket, { type: 'SET_PLAY_ORDER', order: [3, 2, 1] })).toBe(hubWithBracket);
  });
});

describe('GO_HUB', () => {
  it('leaves setup for two teams, or when a play order exists', () => {
    expect(eventReducer(session(2), { type: 'GO_HUB' }).phase).toBe('hub');
    const three = session(3);
    expect(eventReducer(three, { type: 'GO_HUB' })).toBe(three);
    expect(run(three, { type: 'SET_PLAY_ORDER', order: [1, 2, 3] }, { type: 'GO_HUB' }).phase).toBe('hub');
  });

  it('is illegal in the hub, in a game phase with a game, in plinko and during doors picking', () => {
    const hub = hubSession(3);
    expect(eventReducer(hub, { type: 'GO_HUB' })).toBe(hub);
    const game = run(hub, { type: 'START_GAME', kind: 'wheel', instanceSeed: 1 });
    expect(eventReducer(game, { type: 'GO_HUB' })).toBe(game);
    const plinko = run(hub, { type: 'START_PLINKO' });
    expect(eventReducer(plinko, { type: 'GO_HUB' })).toBe(plinko);
    const doors = run(session(3), { type: 'START_DOORS' });
    expect(eventReducer(doors, { type: 'GO_HUB' })).toBe(doors);
  });

  it('returns from puzzle and winner', () => {
    const hub = hubSession(3);
    expect(run(hub, { type: 'START_PUZZLE' }, { type: 'GO_HUB' }).phase).toBe('hub');
    expect(run(hub, { type: 'ANNOUNCE_WINNER' }, { type: 'GO_HUB' }).phase).toBe('hub');
  });
});

describe('START_GAME', () => {
  it('starts a main game from the hub', () => {
    const s = eventReducer(hubSession(2), { type: 'START_GAME', kind: 'wheel', instanceSeed: 42 });
    expect(s.phase).toBe('wheel');
    expect(s.game).toEqual({ kind: 'wheel', instanceSeed: 42, state: null });
  });

  it('is illegal outside the hub, while a game runs, for a played game and for a bad seed', () => {
    const setup = session(2);
    expect(eventReducer(setup, { type: 'START_GAME', kind: 'feud', instanceSeed: 1 })).toBe(setup);
    const hub = hubSession(2);
    expect(eventReducer(hub, { type: 'START_GAME', kind: 'feud', instanceSeed: Number.NaN })).toBe(hub);
    const running = run(hub, { type: 'START_GAME', kind: 'feud', instanceSeed: 1 });
    expect(eventReducer(running, { type: 'START_GAME', kind: 'wheel', instanceSeed: 2 })).toBe(running);
    const played = run(running, win(1));
    expect(eventReducer(played, { type: 'START_GAME', kind: 'feud', instanceSeed: 3 })).toBe(played);
  });

  it('builds the bracket from the play order for 3+ teams and not for two', () => {
    const three = run(session(3), { type: 'SET_PLAY_ORDER', order: [3, 1, 2] }, { type: 'GO_HUB' });
    const s = eventReducer(three, { type: 'START_GAME', kind: 'feud', instanceSeed: 1 });
    expect(s.bracket?.seeds).toEqual([3, 1, 2]);
    expect(
      eventReducer(hubSession(2), { type: 'START_GAME', kind: 'feud', instanceSeed: 1 }).bracket,
    ).toBeNull();
    expect(
      eventReducer(hubSession(3), { type: 'START_GAME', kind: 'wheel', instanceSeed: 1 }).bracket,
    ).toBeNull();
  });
});

describe('GAME_STATE', () => {
  it('stores the engine snapshot and is illegal without a game', () => {
    const hub = hubSession(2);
    expect(eventReducer(hub, { type: 'GAME_STATE', state: { x: 1 } })).toBe(hub);
    const g = run(hub, { type: 'START_GAME', kind: 'wheel', instanceSeed: 1 });
    const snap = { round: 2 };
    const s = eventReducer(g, { type: 'GAME_STATE', state: snap });
    expect(s.game?.state).toBe(snap);
    expect(eventReducer(s, { type: 'GAME_STATE', state: snap })).toBe(s);
  });
});

describe('GAME_WON crediting', () => {
  it('credits the winner roundScore + 1 chip + bonus chips and extras to the others (Wheel)', () => {
    let s = run(hubSession(3), { type: 'START_GAME', kind: 'wheel', instanceSeed: 1 });
    s = eventReducer(
      s,
      win(2, 185, {
        extraScores: [
          { team: 1, points: 42 },
          { team: 3, points: 7 },
        ],
        bonusChips: 1,
      }),
    );
    expect([teamScore(s, 1), teamScore(s, 2), teamScore(s, 3)]).toEqual([42, 185, 7]);
    expect([teamChips(s, 1), teamChips(s, 2), teamChips(s, 3)]).toEqual([0, 2, 0]);
    expect(s.phase).toBe('hub');
    expect(s.game).toBeNull();
    expect(s.completedGames).toEqual(['wheel']);
    expect(s.availableMainGames).toEqual(['feud']);
  });

  it('adds to existing scores rather than replacing them', () => {
    let s = run(
      hubSession(2),
      { type: 'SCORE_CHANGE', team: 1, delta: 50 },
      { type: 'START_GAME', kind: 'feud', instanceSeed: 1 },
    );
    s = eventReducer(s, win(1, 320, { extraScores: [{ team: 2, points: 100 }] }));
    expect(teamScore(s, 1)).toBe(370);
    expect(teamScore(s, 2)).toBe(100);
    expect(teamChips(s, 1)).toBe(1);
  });

  it('is idempotent: a second report credits nothing and returns the same object', () => {
    let s = run(hubSession(2), { type: 'START_GAME', kind: 'wheel', instanceSeed: 1 });
    s = eventReducer(s, win(1));
    expect(eventReducer(s, win(1))).toBe(s);
    expect(eventReducer(s, win(2, 999))).toBe(s);
  });

  it('ignores a stale report stamped with an older gameInstance', () => {
    let s = run(hubSession(2), { type: 'START_GAME', kind: 'wheel', instanceSeed: 1 });
    const instance = s.gameInstance;
    s = eventReducer(s, win(1, 100, { gameInstance: instance }));
    expect(teamScore(s, 1)).toBe(100);
    // A new game slot runs; a late duplicate from the old controller must not credit it.
    let next = run(createEventSession(s.teams), { type: 'GO_HUB' });
    next = { ...next, gameInstance: s.gameInstance };
    next = run(next, { type: 'START_GAME', kind: 'feud', instanceSeed: 2 });
    expect(eventReducer(next, win(2, 50, { gameInstance: instance }))).toBe(next);
  });

  it('is ignored outside a game phase', () => {
    for (const s of [
      session(2),
      hubSession(2),
      run(hubSession(2), { type: 'START_SPEED' }),
      run(hubSession(2), { type: 'START_PLINKO' }),
      run(hubSession(2), { type: 'START_PUZZLE' }),
      run(hubSession(2), { type: 'ANNOUNCE_WINNER' }),
    ]) {
      expect(eventReducer(s, win(1))).toBe(s);
    }
  });

  it('rejects unknown winners, non-integer scores, negative bonus chips and bad extras', () => {
    const s = run(hubSession(3), { type: 'START_GAME', kind: 'wheel', instanceSeed: 1 });
    expect(eventReducer(s, win(9))).toBe(s);
    expect(eventReducer(s, win(1, 10.5))).toBe(s);
    expect(eventReducer(s, win(1, 10, { bonusChips: -1 }))).toBe(s);
    expect(eventReducer(s, win(1, 10, { extraScores: [{ team: 9, points: 5 }] }))).toBe(s);
    expect(eventReducer(s, win(1, 10, { extraScores: [{ team: 1, points: 5 }] }))).toBe(s);
    expect(eventReducer(s, win(1, 10, { extraScores: [{ team: 2, points: 0.5 }] }))).toBe(s);
  });
});

describe('Feud bracket flow', () => {
  it('three teams: two matches, instance bumped, hub returns only when the bracket completes', () => {
    let s = run(
      session(3),
      { type: 'SET_PLAY_ORDER', order: [1, 2, 3] },
      { type: 'GO_HUB' },
      { type: 'START_GAME', kind: 'feud', instanceSeed: 1 },
    );
    expect(s.bracket && currentMatch(s.bracket)).toMatchObject({ a: 2, b: 3 });
    const i0 = s.gameInstance;

    s = eventReducer(s, win(3, 300, { extraScores: [{ team: 2, points: 120 }] }));
    expect(s.phase).toBe('feud'); // bracket continues
    expect(s.game).toBeNull();
    expect(s.gameInstance).toBe(i0 + 1);
    expect(s.completedGames).toEqual([]);
    expect(teamChips(s, 3)).toBe(1);
    expect(nextBracketMatch(s)).toMatchObject({ a: { id: 1 }, b: { id: 3 } });

    s = eventReducer(s, { type: 'START_GAME', kind: 'feud', instanceSeed: 2 });
    expect(s.phase).toBe('feud');
    expect(s.game).toMatchObject({ instanceSeed: 2 });
    s = eventReducer(s, win(1, 310, { extraScores: [{ team: 3, points: 90 }] }));
    expect(s.phase).toBe('hub');
    expect(s.completedGames).toEqual(['feud']);
    expect(s.availableMainGames).toEqual(['wheel']);
    expect(s.gameInstance).toBe(i0 + 2);
    expect([teamScore(s, 1), teamScore(s, 2), teamScore(s, 3)]).toEqual([310, 120, 390]);
    expect([teamChips(s, 1), teamChips(s, 2), teamChips(s, 3)]).toEqual([1, 0, 1]);
    expect(nextBracketMatch(s)).toBeNull();
  });

  it('rejects a winner outside the current match', () => {
    const s = run(hubSession(3), { type: 'START_GAME', kind: 'feud', instanceSeed: 1 });
    expect(eventReducer(s, win(1))).toBe(s); // team 1 has a bye; match is 2 v 3
  });

  it('start of the next match is illegal while the previous game is still running, and between matches only for feud', () => {
    let s = run(hubSession(3), { type: 'START_GAME', kind: 'feud', instanceSeed: 1 });
    expect(eventReducer(s, { type: 'START_GAME', kind: 'feud', instanceSeed: 2 })).toBe(s);
    s = eventReducer(s, win(2));
    expect(eventReducer(s, { type: 'START_GAME', kind: 'wheel', instanceSeed: 2 })).toBe(s);
  });

  it('a duplicate GAME_WON between matches changes nothing', () => {
    let s = run(hubSession(4), { type: 'START_GAME', kind: 'feud', instanceSeed: 1 });
    s = eventReducer(s, win(1));
    expect(s.game).toBeNull();
    expect(eventReducer(s, win(1))).toBe(s);
  });

  it('abandoning mid-bracket keeps the bracket and the same match comes back', () => {
    let s = run(hubSession(4), { type: 'START_GAME', kind: 'feud', instanceSeed: 1 });
    s = eventReducer(s, win(1));
    const before = nextBracketMatch(s);
    s = eventReducer(s, { type: 'START_GAME', kind: 'feud', instanceSeed: 2 });
    s = eventReducer(s, { type: 'ABANDON_GAME' });
    expect(s.phase).toBe('hub');
    expect(nextBracketMatch(s)).toEqual(before);
    expect(teamScore(s, 1)).toBe(300);
  });

  it('plays a full eight team bracket to the end', () => {
    let s = hubSession(8);
    s = eventReducer(s, { type: 'START_GAME', kind: 'feud', instanceSeed: 1 });
    let matches = 0;
    while (s.game) {
      const m = s.bracket ? currentMatch(s.bracket) : null;
      expect(m).not.toBeNull();
      s = eventReducer(s, win(m?.a ?? 0, 100));
      matches++;
      if (s.phase === 'feud')
        s = eventReducer(s, { type: 'START_GAME', kind: 'feud', instanceSeed: matches });
    }
    expect(matches).toBe(7);
    expect(s.phase).toBe('hub');
    expect(s.completedGames).toEqual(['feud']);
    expect(teamChips(s, 1)).toBe(3);
  });
});

describe('ABANDON_GAME', () => {
  it('returns to the hub with no scores and bumps the instance', () => {
    const running = run(
      hubSession(2),
      { type: 'START_GAME', kind: 'wheel', instanceSeed: 1 },
      { type: 'GAME_STATE', state: { a: 1 } },
    );
    const s = eventReducer(running, { type: 'ABANDON_GAME' });
    expect(s.phase).toBe('hub');
    expect(s.game).toBeNull();
    expect(s.gameInstance).toBe(running.gameInstance + 1);
    expect(s.teams).toEqual(running.teams);
    expect(s.completedGames).toEqual([]);
    expect(s.availableMainGames).toEqual(['feud', 'wheel']);
  });

  it('is illegal outside feud and wheel', () => {
    const hub = hubSession(2);
    expect(eventReducer(hub, { type: 'ABANDON_GAME' })).toBe(hub);
    const speed = run(hub, { type: 'START_SPEED' });
    expect(eventReducer(speed, { type: 'ABANDON_GAME' })).toBe(speed);
  });
});

describe('SCORE_CHANGE and CHIP_CHANGE', () => {
  it('adjusts any team in any phase and never goes below zero', () => {
    let s = session(2);
    s = eventReducer(s, { type: 'SCORE_CHANGE', team: 1, delta: 10 });
    expect(teamScore(s, 1)).toBe(10);
    s = eventReducer(s, { type: 'SCORE_CHANGE', team: 1, delta: -25 });
    expect(teamScore(s, 1)).toBe(0);
    s = eventReducer(s, { type: 'CHIP_CHANGE', team: 2, delta: 1 });
    expect(teamChips(s, 2)).toBe(1);
    s = eventReducer(s, { type: 'CHIP_CHANGE', team: 2, delta: -3 });
    expect(teamChips(s, 2)).toBe(0);
    const g = run(
      hubSession(2),
      { type: 'START_GAME', kind: 'feud', instanceSeed: 1 },
      { type: 'SCORE_CHANGE', team: 2, delta: 10 },
    );
    expect(teamScore(g, 2)).toBe(10);
  });

  it('is illegal for unknown teams, zero or fractional deltas, and no-ops', () => {
    const s = session(2);
    for (const type of ['SCORE_CHANGE', 'CHIP_CHANGE'] as const) {
      expect(eventReducer(s, { type, team: 9, delta: 1 })).toBe(s);
      expect(eventReducer(s, { type, team: 1, delta: 0 })).toBe(s);
      expect(eventReducer(s, { type, team: 1, delta: 0.5 })).toBe(s);
      expect(eventReducer(s, { type, team: 1, delta: -1 })).toBe(s); // already 0, clamp = no change
    }
  });
});

describe('CONTENT_USED', () => {
  it('adds new ids once, in order', () => {
    let s = eventReducer(session(2), { type: 'CONTENT_USED', ids: ['a', 'b', 'a'] });
    expect(s.usedContentIds).toEqual(['a', 'b']);
    const same = eventReducer(s, { type: 'CONTENT_USED', ids: ['b'] });
    expect(same).toBe(s);
    s = eventReducer(s, { type: 'CONTENT_USED', ids: ['c', 'a'] });
    expect(s.usedContentIds).toEqual(['a', 'b', 'c']);
  });

  it('ignores an empty list and empty ids', () => {
    const s = session(2);
    expect(eventReducer(s, { type: 'CONTENT_USED', ids: [] })).toBe(s);
    expect(eventReducer(s, { type: 'CONTENT_USED', ids: [''] })).toBe(s);
  });
});

describe('ANNOUNCE_WINNER', () => {
  it('is legal from the hub and plinko only', () => {
    expect(eventReducer(hubSession(2), { type: 'ANNOUNCE_WINNER' }).phase).toBe('winner');
    expect(run(hubSession(2), { type: 'START_PLINKO' }, { type: 'ANNOUNCE_WINNER' }).phase).toBe('winner');
    const setup = session(2);
    expect(eventReducer(setup, { type: 'ANNOUNCE_WINNER' })).toBe(setup);
    const game = run(hubSession(2), { type: 'START_GAME', kind: 'feud', instanceSeed: 1 });
    expect(eventReducer(game, { type: 'ANNOUNCE_WINNER' })).toBe(game);
    const done = run(hubSession(2), { type: 'ANNOUNCE_WINNER' });
    expect(eventReducer(done, { type: 'ANNOUNCE_WINNER' })).toBe(done);
  });
});

describe('START_PUZZLE', () => {
  it('is hub-only', () => {
    expect(eventReducer(hubSession(2), { type: 'START_PUZZLE' }).phase).toBe('puzzle');
    const setup = session(2);
    expect(eventReducer(setup, { type: 'START_PUZZLE' })).toBe(setup);
  });
});

describe('RESET_SCORES', () => {
  const dirty = (): EventSession => {
    let s = run(hubSession(3), { type: 'START_GAME', kind: 'feud', instanceSeed: 1 }, win(2, 200), {
      type: 'CONTENT_USED',
      ids: ['q1', 'q2'],
    });
    s = run(s, { type: 'START_GAME', kind: 'feud', instanceSeed: 2 });
    return s;
  };

  it('ends a running game, zeroes scores and chips, clears bracket, played marks and used content, keeps teams and order', () => {
    const before = dirty();
    expect(before.game).not.toBeNull();
    const s = eventReducer(before, { type: 'RESET_SCORES' });
    expect(s.phase).toBe('hub');
    expect(s.game).toBeNull();
    expect(s.teams.every((t) => t.score === 0 && t.chips === 0)).toBe(true);
    expect(s.teams.map((t) => t.name)).toEqual(before.teams.map((t) => t.name));
    expect(s.playOrder).toEqual(before.playOrder);
    expect(s.bracket).toBeNull();
    expect(s.completedGames).toEqual([]);
    expect(s.availableMainGames).toEqual(['feud', 'wheel']);
    expect(s.usedContentIds).toEqual([]);
    expect(s.gameInstance).toBe(before.gameInstance + 1);
  });

  it('is a no-op in setup, and works from the hub without bumping the instance', () => {
    const setup = session(2);
    expect(eventReducer(setup, { type: 'RESET_SCORES' })).toBe(setup);
    const hub = run(
      hubSession(2),
      { type: 'SCORE_CHANGE', team: 1, delta: 5 },
      { type: 'CONTENT_USED', ids: ['x'] },
    );
    const s = eventReducer(hub, { type: 'RESET_SCORES' });
    expect(teamScore(s, 1)).toBe(0);
    expect(s.usedContentIds).toEqual([]);
    expect(s.gameInstance).toBe(hub.gameInstance);
  });

  it('also leaves speed, plinko and winner for the hub', () => {
    for (const start of ['START_SPEED', 'START_PLINKO', 'ANNOUNCE_WINNER'] as const) {
      const s = eventReducer(run(hubSession(2), { type: start }), { type: 'RESET_SCORES' });
      expect(s.phase).toBe('hub');
      expect(s.speed).toBeNull();
      expect(s.plinko).toBeNull();
    }
  });
});

describe('NEW_EVENT', () => {
  it('returns to a fresh setup with the same teams zeroed, used content cleared, and a bumped instance', () => {
    const before = run(
      hubSession(3),
      { type: 'SCORE_CHANGE', team: 1, delta: 30 },
      { type: 'CONTENT_USED', ids: ['q'] },
      { type: 'START_GAME', kind: 'wheel', instanceSeed: 1 },
    );
    const s = eventReducer(before, { type: 'NEW_EVENT' });
    expect(s.phase).toBe('setup');
    expect(s.game).toBeNull();
    expect(s.playOrder).toBeNull();
    expect(s.usedContentIds).toEqual([]);
    expect(s.teams.map((t) => [t.name, t.score, t.chips])).toEqual(before.teams.map((t) => [t.name, 0, 0]));
    expect(s.gameInstance).toBe(before.gameInstance + 1);
    // a late report from the old game cannot credit the new event
    expect(eventReducer(s, win(1))).toBe(s);
  });

  it('works from the winner screen', () => {
    const s = run(hubSession(2), { type: 'ANNOUNCE_WINNER' }, { type: 'NEW_EVENT' });
    expect(s.phase).toBe('setup');
  });
});

describe('purity', () => {
  it('never mutates the input state', () => {
    const s = run(hubSession(3), { type: 'START_GAME', kind: 'feud', instanceSeed: 1 });
    const snapshot = JSON.stringify(s);
    eventReducer(s, win(2, 100, { extraScores: [{ team: 3, points: 5 }] }));
    eventReducer(s, { type: 'RESET_SCORES' });
    eventReducer(s, { type: 'ABANDON_GAME' });
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});
