import { beforeEach, describe, expect, it } from 'vitest';
import type { CachedState } from '@/data';
import { createEventSession, defaultTeamEdits, eventReducer, type EventSession } from '@/engines/event';
import { chooseSeed, loadEventSeed } from './loadEventSeed';
import { createTestServices, signUpHost, type TestServices } from './testKit';

const sessionWith = (names: string[]): EventSession =>
  createEventSession(names.map((name, i) => ({ ...defaultTeamEdits(names.length)[i]!, name })));

const cached = (session: EventSession, rev: number, synced: boolean): CachedState => ({
  rev,
  state: session,
  savedAt: '2026-01-01T00:00:00.000Z',
  synced,
});

describe('chooseSeed', () => {
  const cloud = { rev: 3, session: sessionWith(['Cloud A', 'Cloud B']) };
  const local = (rev: number, synced: boolean) => ({
    rev,
    synced,
    session: sessionWith(['Local A', 'Local B']),
  });

  it('prefers the higher revision', () => {
    expect(chooseSeed(cloud, local(4, true))?.source).toBe('cache');
    expect(chooseSeed(cloud, local(2, false))?.source).toBe('cloud');
  });

  it('on equal revisions prefers the cloud copy when the cache is synced, and unsynced local edits otherwise', () => {
    expect(chooseSeed(cloud, local(3, true))?.source).toBe('cloud');
    expect(chooseSeed(cloud, local(3, false))?.source).toBe('cache');
  });

  it('uses whichever exists, or nothing', () => {
    expect(chooseSeed(cloud, null)?.source).toBe('cloud');
    expect(chooseSeed(null, local(1, true))?.source).toBe('cache');
    expect(chooseSeed(null, null)).toBeNull();
  });
});

describe('loadEventSeed', () => {
  let services: TestServices;
  let eventId: string;

  beforeEach(async () => {
    services = createTestServices();
    await signUpHost(services.data);
    eventId = (await services.data.events.createEvent('Night')).id;
  });

  it('gives a fresh two-team setup session for a new event', async () => {
    const loaded = await loadEventSeed(services.data, eventId, () => null);
    expect(loaded).toMatchObject({ rev: 0, hasSavedState: false, unsynced: false, notice: null });
    expect(loaded?.session.phase).toBe('setup');
    expect(loaded?.session.teams).toHaveLength(2);
  });

  it('is null for an event that is not the host', async () => {
    expect(await loadEventSeed(services.data, 'nope', () => null)).toBeNull();
  });

  it('loads the cloud copy and reports its revision', async () => {
    const saved = eventReducer(sessionWith(['Reds', 'Blues']), { type: 'GO_HUB' });
    await services.data.events.saveState(eventId, saved, 0);
    const loaded = await loadEventSeed(services.data, eventId, () => null);
    expect(loaded?.rev).toBe(1);
    expect(loaded?.hasSavedState).toBe(true);
    expect(loaded?.session.phase).toBe('hub');
    expect(loaded?.session.teams.map((t) => t.name)).toEqual(['Reds', 'Blues']);
  });

  it('takes a newer unsynced cache and flags it so the stage saves it', async () => {
    await services.data.events.saveState(eventId, sessionWith(['Cloud A', 'Cloud B']), 0);
    const loaded = await loadEventSeed(services.data, eventId, () =>
      cached(sessionWith(['Local A', 'Local B']), 1, false),
    );
    expect(loaded?.session.teams[0]?.name).toBe('Local A');
    expect(loaded?.unsynced).toBe(true);
    expect(loaded?.rev).toBe(1);
  });

  it('ignores a corrupt cloud copy, with a notice, and a corrupt cache', async () => {
    await services.data.events.saveState(eventId, { schemaVersion: 1, teams: 'nope' }, 0);
    const loaded = await loadEventSeed(services.data, eventId, () => ({
      rev: 9,
      state: { garbage: true },
      savedAt: 'x',
      synced: false,
    }));
    expect(loaded?.hasSavedState).toBe(false);
    expect(loaded?.notice).toMatch(/could not be read/);
    expect(loaded?.session.phase).toBe('setup');
  });
});
