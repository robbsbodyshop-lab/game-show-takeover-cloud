import { describe, expect, it } from 'vitest';
import { eventReducer } from './eventReducer';
import { eventSessionSchema, migrateSession, parseSession } from './schema';
import { DRAW_8, hubSession, run, session } from './testHelpers';
import type { EventSession } from './types';

const roundTrip = (s: EventSession): EventSession | null => parseSession(JSON.parse(JSON.stringify(s)));

describe('schema round-trip', () => {
  it('a fresh session', () => {
    const s = session(4);
    expect(roundTrip(s)).toEqual(s);
  });

  it('doors in every stage', () => {
    const picking = run(session(3), { type: 'START_DOORS' });
    const revealing = run(
      picking,
      { type: 'DOOR_PICK', team: 1, door: 1 },
      { type: 'DOOR_PICK', team: 2, door: 2 },
      { type: 'DOOR_PICK', team: 3, door: 3 },
    );
    const done = eventReducer(revealing, { type: 'DOORS_REVEAL', draw: [0.2, 0.7, 0.4] });
    for (const s of [picking, revealing, done]) expect(roundTrip(s)).toEqual(s);
  });

  it('a running game with an engine snapshot and a bracket', () => {
    const s = run(
      hubSession(5),
      { type: 'START_GAME', kind: 'feud', instanceSeed: 77 },
      { type: 'GAME_STATE', state: { phase: 'face-off', board: [{ text: 'x', revealed: false }], n: 3 } },
      { type: 'CONTENT_USED', ids: ['s1'] },
    );
    expect(roundTrip(s)).toEqual(s);
  });

  it('speed and plinko states', () => {
    const speed = run(hubSession(3), { type: 'START_SPEED' }, { type: 'SPEED_START', now: 1000 });
    expect(roundTrip(speed)).toEqual(speed);
    let plinko = run(
      hubSession(3),
      { type: 'CHIP_CHANGE', team: 1, delta: 2 },
      { type: 'START_PLINKO' },
      { type: 'PLINKO_SELECT_COLUMN', team: 1, column: 4 },
      { type: 'PLINKO_DROP', team: 1, draw: DRAW_8 },
      { type: 'PLINKO_SELECT_COLUMN', team: 2, column: 1 },
    );
    expect(roundTrip(plinko)).toEqual(plinko);
    plinko = run(plinko, { type: 'END_PLINKO' }, { type: 'ANNOUNCE_WINNER' });
    expect(roundTrip(plinko)).toEqual(plinko);
  });
});

describe('parseSession rejects bad input', () => {
  it('non-objects, wrong versions and missing fields', () => {
    expect(parseSession(null)).toBeNull();
    expect(parseSession('x')).toBeNull();
    expect(parseSession({})).toBeNull();
    expect(parseSession({ ...session(2), schemaVersion: 2 })).toBeNull();
    const noTeams: Record<string, unknown> = { ...session(2) };
    delete noTeams.teams;
    expect(parseSession(noTeams)).toBeNull();
  });

  it('bad team counts, ids and numbers', () => {
    const s = session(3);
    expect(parseSession({ ...s, teams: s.teams.slice(0, 1) })).toBeNull();
    expect(parseSession({ ...s, teams: s.teams.map((t, i) => ({ ...t, id: i + 2 })) })).toBeNull();
    expect(parseSession({ ...s, teams: s.teams.map((t) => ({ ...t, chips: -1 })) })).toBeNull();
    expect(parseSession({ ...s, teams: s.teams.map((t) => ({ ...t, score: 1.5 })) })).toBeNull();
  });

  it('inconsistent play order, phase and game', () => {
    const s = session(3);
    expect(parseSession({ ...s, playOrder: [1, 2] })).toBeNull();
    expect(parseSession({ ...s, playOrder: [1, 2, 9] })).toBeNull();
    expect(parseSession({ ...s, phase: 'doors' })).toBeNull();
    expect(parseSession({ ...s, phase: 'plinko' })).toBeNull();
    expect(parseSession({ ...s, phase: 'speed' })).toBeNull();
    expect(
      parseSession({ ...s, phase: 'feud', game: { kind: 'wheel', instanceSeed: 1, state: null } }),
    ).toBeNull();
    expect(parseSession({ ...s, phase: 'bogus' })).toBeNull();
  });

  it('a settings block with the wrong number of Plinko slots', () => {
    const s = session(2);
    expect(parseSession({ ...s, settings: { ...s.settings, plinkoSlotValues: [1, 2, 3] } })).toBeNull();
  });
});

describe('migrateSession', () => {
  it('passes version 1 through and refuses unknown versions', () => {
    const s = session(2);
    expect(migrateSession(s)).toBe(s);
    expect(migrateSession({ schemaVersion: 99 })).toBeNull();
    expect(migrateSession(undefined)).toBeNull();
  });

  it('the exported schema agrees with parseSession', () => {
    const s = session(2);
    expect(eventSessionSchema.safeParse(s).success).toBe(true);
  });
});
