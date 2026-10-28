import { describe, expect, it } from 'vitest';
import {
  canEditTeams,
  isGamePlaying,
  leaders,
  nextBracketMatch,
  plinkoChipsRemaining,
  standings,
  teamsInPlayOrder,
  winnerTeam,
} from './selectors';
import { hubSession, run, session } from './testHelpers';

describe('teamsInPlayOrder', () => {
  it('uses list order until an order is set, then the play order', () => {
    const s = session(3);
    expect(teamsInPlayOrder(s).map((t) => t.id)).toEqual([1, 2, 3]);
    const ordered = run(s, { type: 'SET_PLAY_ORDER', order: [3, 1, 2] });
    expect(teamsInPlayOrder(ordered).map((t) => t.id)).toEqual([3, 1, 2]);
  });
});

describe('isGamePlaying / canEditTeams', () => {
  it('is true only while a game is on screen', () => {
    const hub = hubSession(3);
    expect(isGamePlaying(hub)).toBe(false);
    const g = run(hub, { type: 'START_GAME', kind: 'feud', instanceSeed: 1 });
    expect(isGamePlaying(g)).toBe(true);
    const between = run(g, { type: 'GAME_WON', winnerId: 2, roundScore: 10 });
    expect(isGamePlaying(between)).toBe(false);
    expect(canEditTeams(between)).toBe(false);
    expect(canEditTeams(hub)).toBe(true);
    expect(canEditTeams(session(2))).toBe(true);
  });
});

describe('standings', () => {
  const scored = () =>
    run(
      session(5),
      { type: 'SCORE_CHANGE', team: 1, delta: 50 },
      { type: 'SCORE_CHANGE', team: 2, delta: 90 },
      { type: 'SCORE_CHANGE', team: 3, delta: 50 },
      { type: 'SCORE_CHANGE', team: 4, delta: 90 },
    );

  it('sorts by score, shares ranks on ties and keeps list order inside a tie', () => {
    const rows = standings(scored()).map((r) => [r.team.id, r.rank]);
    expect(rows).toEqual([
      [2, 1],
      [4, 1],
      [1, 3],
      [3, 3],
      [5, 5],
    ]);
  });

  it('leaders and winnerTeam', () => {
    const s = scored();
    expect(leaders(s).map((t) => t.id)).toEqual([2, 4]);
    expect(winnerTeam(s)).toBeNull();
    const broken = run(s, { type: 'SCORE_CHANGE', team: 4, delta: 1 });
    expect(winnerTeam(broken)?.id).toBe(4);
  });

  it('an all-zero start is a full tie', () => {
    expect(winnerTeam(session(3))).toBeNull();
    expect(standings(session(3)).every((r) => r.rank === 1)).toBe(true);
  });
});

describe('nextBracketMatch', () => {
  it('two teams: the pair; before the bracket exists: a preview from the order; after Feud: null', () => {
    expect(nextBracketMatch(session(2))).toMatchObject({ a: { id: 1 }, b: { id: 2 } });
    const s = run(session(4), { type: 'SET_PLAY_ORDER', order: [4, 3, 2, 1] });
    expect(nextBracketMatch(s)).toMatchObject({ round: 0, slot: 0, a: { id: 4 }, b: { id: 1 } });
    const done = run(
      hubSession(2),
      { type: 'START_GAME', kind: 'feud', instanceSeed: 1 },
      { type: 'GAME_WON', winnerId: 1, roundScore: 100 },
    );
    expect(nextBracketMatch(done)).toBeNull();
  });
});

describe('plinkoChipsRemaining', () => {
  it('sums every team chips', () => {
    const s = run(
      hubSession(3),
      { type: 'CHIP_CHANGE', team: 1, delta: 2 },
      { type: 'CHIP_CHANGE', team: 3, delta: 1 },
    );
    expect(plinkoChipsRemaining(s)).toBe(3);
  });
});
