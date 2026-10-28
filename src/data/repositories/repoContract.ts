import { describe, expect, it } from 'vitest';
import { DataError } from '../errors';
import type { DataLayer } from '../index';
import { ROOM_CODE_PATTERN } from '../roomCode';
import type { AuthSession } from '../types';

/**
 * Behavioural contract every data layer implementation must satisfy. It runs against the memory
 * implementation in CI; run it against a Supabase branch by passing a factory that returns a layer
 * with fresh users (the Supabase tests in this folder only assert call shapes).
 */

async function signUpAs(layer: DataLayer, email: string): Promise<AuthSession> {
  await layer.auth.signOut();
  const result = await layer.auth.signUp(email, 'correct horse');
  if (!result.ok || result.session === null) throw new Error(`sign up failed for ${email}`);
  return result.session;
}

async function signInAnonymous(layer: DataLayer): Promise<AuthSession> {
  await layer.auth.signOut();
  const result = await layer.auth.signInAnonymously();
  if (!result.ok || result.session === null) throw new Error('anonymous sign in failed');
  return result.session;
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return undefined;
}

const TEAMS_STATE = {
  schemaVersion: 1,
  teams: [
    { id: 1, name: 'Red', color: '#f00', players: ['Ann'], score: 40 },
    { id: 2, name: 'Blue', color: '#00f', players: [], score: 0 },
  ],
  phase: 'setup',
};

export function describeDataLayerContract(label: string, createLayer: () => DataLayer): void {
  describe(`${label}: AuthService`, () => {
    it('signs up, signs out and signs in again', async () => {
      const layer = createLayer();
      const up = await layer.auth.signUp('Host@Example.com', 'correct horse');
      expect(up.ok && up.session?.user.email).toBe('host@example.com');
      expect((await layer.auth.currentUser())?.isAnonymous).toBe(false);

      await layer.auth.signOut();
      expect(await layer.auth.getSession()).toBeNull();
      expect(await layer.auth.currentUser()).toBeNull();

      const bad = await layer.auth.signInWithPassword('host@example.com', 'wrong password');
      expect(bad.ok).toBe(false);
      const good = await layer.auth.signInWithPassword('host@example.com', 'correct horse');
      expect(good.ok && good.session !== null).toBe(true);
    });

    it('refuses a duplicate sign up', async () => {
      const layer = createLayer();
      await layer.auth.signUp('dup@example.com', 'correct horse');
      const again = await layer.auth.signUp('dup@example.com', 'correct horse');
      expect(again.ok).toBe(false);
    });

    it('creates anonymous sessions with distinct ids', async () => {
      const layer = createLayer();
      const a = await signInAnonymous(layer);
      const b = await signInAnonymous(layer);
      expect(a.user.isAnonymous).toBe(true);
      expect(a.user.email).toBeNull();
      expect(a.user.id).not.toBe(b.user.id);
    });

    it('notifies listeners until they unsubscribe', async () => {
      const layer = createLayer();
      const seen: (string | null)[] = [];
      const off = layer.auth.onAuthStateChange((s) => seen.push(s?.user.email ?? null));
      await layer.auth.signUp('listen@example.com', 'correct horse');
      await layer.auth.signOut();
      off();
      await layer.auth.signInWithPassword('listen@example.com', 'correct horse');
      expect(seen).toEqual(['listen@example.com', null]);
    });
  });

  describe(`${label}: EventRepo`, () => {
    it('rejects every call without a session', async () => {
      const layer = createLayer();
      const error = await rejectionOf(layer.events.listEvents());
      expect(error).toBeInstanceOf(DataError);
      expect((error as DataError).code).toBe('not_authenticated');
    });

    it('creates events in setup with an empty save slot and lists them newest first', async () => {
      const layer = createLayer();
      const session = await signUpAs(layer, 'a@example.com');
      const first = await layer.events.createEvent('  Friday night  ');
      const second = await layer.events.createEvent('Saturday');
      expect(first).toMatchObject({ name: 'Friday night', status: 'setup', ownerId: session.user.id });

      const slot = await layer.events.loadState(first.id);
      expect(slot).toMatchObject({ eventId: first.id, rev: 0, state: null });

      const listed = await layer.events.listEvents();
      expect(listed.map((e) => e.id)).toEqual([second.id, first.id]);
      expect(await layer.events.getEvent(first.id)).toEqual(first);
    });

    it("never shows or touches another host's events", async () => {
      const layer = createLayer();
      await signUpAs(layer, 'owner@example.com');
      const event = await layer.events.createEvent('Mine');
      await signUpAs(layer, 'other@example.com');

      expect(await layer.events.listEvents()).toEqual([]);
      expect(await layer.events.getEvent(event.id)).toBeNull();
      expect(await layer.events.loadState(event.id)).toBeNull();
      expect(((await rejectionOf(layer.events.saveState(event.id, {}, 0))) as DataError).code).toBe(
        'not_found',
      );
      expect(((await rejectionOf(layer.events.finishEvent(event.id))) as DataError).code).toBe('not_found');
      await layer.events.deleteEvent(event.id);

      await layer.auth.signInWithPassword('owner@example.com', 'correct horse');
      expect(await layer.events.getEvent(event.id)).toEqual(event);
    });

    it('saves with compare-and-set on the revision', async () => {
      const layer = createLayer();
      await signUpAs(layer, 'cas@example.com');
      const { id } = await layer.events.createEvent('CAS');

      expect(await layer.events.saveState(id, { n: 1 }, 0)).toEqual({ ok: true, rev: 1 });
      expect(await layer.events.saveState(id, { n: 2 }, 1)).toEqual({ ok: true, rev: 2 });

      // A second stage that still believes rev is 1 loses and changes nothing.
      expect(await layer.events.saveState(id, { n: 99 }, 1)).toEqual({ ok: false, reason: 'conflict' });
      const slot = await layer.events.loadState(id);
      expect(slot).toMatchObject({ rev: 2, state: { n: 2 } });

      // A writer that is ahead of the stored rev conflicts too.
      expect(await layer.events.saveState(id, { n: 3 }, 7)).toEqual({ ok: false, reason: 'conflict' });
    });

    it('round-trips state as JSON', async () => {
      const layer = createLayer();
      await signUpAs(layer, 'json@example.com');
      const { id } = await layer.events.createEvent('JSON');
      await layer.events.saveState(id, { a: [1, 2, { b: null }], skipped: undefined, text: 'é' }, 0);
      expect((await layer.events.loadState(id))?.state).toEqual({ a: [1, 2, { b: null }], text: 'é' });
    });

    it('finishes and deletes events', async () => {
      const layer = createLayer();
      await signUpAs(layer, 'end@example.com');
      const { id } = await layer.events.createEvent('End');
      await layer.events.finishEvent(id);
      expect((await layer.events.getEvent(id))?.status).toBe('finished');

      await layer.events.deleteEvent(id);
      expect(await layer.events.getEvent(id)).toBeNull();
      expect(await layer.events.loadState(id)).toBeNull();
      await layer.events.deleteEvent(id); // idempotent
    });
  });

  describe(`${label}: SettingsRepo`, () => {
    it('returns empty groups, then merges saves per group', async () => {
      const layer = createLayer();
      await signUpAs(layer, 's@example.com');
      expect(await layer.settings.load()).toEqual({ feud: {}, wheel: {}, app: {} });

      expect(await layer.settings.save({ feud: { timer: 30 } })).toEqual({
        feud: { timer: 30 },
        wheel: {},
        app: {},
      });
      const merged = await layer.settings.save({ app: { crt: true } });
      expect(merged).toEqual({ feud: { timer: 30 }, wheel: {}, app: { crt: true } });
      expect(await layer.settings.load()).toEqual(merged);

      // A group is replaced as a whole.
      expect((await layer.settings.save({ feud: { rounds: 4 } })).feud).toEqual({ rounds: 4 });
    });

    it('keeps settings per host', async () => {
      const layer = createLayer();
      await signUpAs(layer, 'one@example.com');
      await layer.settings.save({ app: { who: 'one' } });
      await signUpAs(layer, 'two@example.com');
      expect((await layer.settings.load()).app).toEqual({});
    });
  });

  describe(`${label}: RoomRepo`, () => {
    async function openedRoom(layer: DataLayer): Promise<{ code: string; eventId: string }> {
      await signUpAs(layer, `host-${Math.random().toString(36).slice(2)}@example.com`);
      const event = await layer.events.createEvent('Room test');
      await layer.events.saveState(event.id, TEAMS_STATE, 0);
      return { code: await layer.rooms.openRoom(event.id), eventId: event.id };
    }

    it('opens one room per event with a 4-consonant code', async () => {
      const layer = createLayer();
      const { code, eventId } = await openedRoom(layer);
      expect(code).toMatch(ROOM_CODE_PATTERN);
      expect(await layer.rooms.openRoom(eventId)).toBe(code);
    });

    it('lets only the owner open a room', async () => {
      const layer = createLayer();
      const { eventId } = await openedRoom(layer);
      await signUpAs(layer, 'intruder@example.com');
      const error = await rejectionOf(layer.rooms.openRoom(eventId));
      expect((error as DataError).code).toBe('forbidden');
    });

    it('joins a phone and returns only id, name, color for each team', async () => {
      const layer = createLayer();
      const { code, eventId } = await openedRoom(layer);
      await signInAnonymous(layer);

      const joined = await layer.rooms.joinRoom(` ${code.toLowerCase()} `, 2, 'Pat');
      expect(joined).toEqual({
        ok: true,
        room: {
          code,
          eventId,
          teams: [
            { id: 1, name: 'Red', color: '#f00' },
            { id: 2, name: 'Blue', color: '#00f' },
          ],
        },
      });
      // Joining again (team change) is fine.
      expect((await layer.rooms.joinRoom(code, 1, 'Pat')).ok).toBe(true);
    });

    it('answers not_found for unknown or malformed codes', async () => {
      const layer = createLayer();
      const { code } = await openedRoom(layer);
      await signInAnonymous(layer);
      const unknown = code === 'BCDF' ? 'ZXWV' : 'BCDF';
      expect(await layer.rooms.joinRoom(unknown, 1, 'Pat')).toEqual({ ok: false, reason: 'not_found' });
      expect(await layer.rooms.joinRoom('12', 1, 'Pat')).toEqual({ ok: false, reason: 'not_found' });
    });

    it('rate limits a user after 5 failed joins, even for the right code, but not other users', async () => {
      const layer = createLayer();
      const { code } = await openedRoom(layer);
      await signInAnonymous(layer);
      for (let i = 0; i < 5; i += 1) {
        expect(await layer.rooms.joinRoom('BBBB', 1, 'Guess')).toEqual({ ok: false, reason: 'not_found' });
      }
      expect(await layer.rooms.joinRoom('BBBB', 1, 'Guess')).toEqual({ ok: false, reason: 'rate_limited' });
      expect(await layer.rooms.joinRoom(code, 1, 'Guess')).toEqual({ ok: false, reason: 'rate_limited' });

      await signInAnonymous(layer);
      expect((await layer.rooms.joinRoom(code, 1, 'Fresh')).ok).toBe(true);
    });

    it('lets only the owner attach a host view', async () => {
      const layer = createLayer();
      const { code } = await openedRoom(layer);
      await expect(layer.rooms.joinRoomAsHost(code)).resolves.toBeUndefined();
      await signInAnonymous(layer);
      expect(((await rejectionOf(layer.rooms.joinRoomAsHost(code))) as DataError).code).toBe('forbidden');
    });

    it('lets members touch the room and phones leave it', async () => {
      const layer = createLayer();
      const { code } = await openedRoom(layer);
      await expect(layer.rooms.touchRoom(code)).resolves.toBeUndefined(); // the owner is a member

      await signInAnonymous(layer);
      expect(((await rejectionOf(layer.rooms.touchRoom(code))) as DataError).code).toBe('forbidden');
      await layer.rooms.joinRoom(code, 1, 'Pat');
      await expect(layer.rooms.touchRoom(code)).resolves.toBeUndefined();
      await layer.rooms.leaveRoom();
      expect(((await rejectionOf(layer.rooms.touchRoom(code))) as DataError).code).toBe('forbidden');
    });

    it('rejects teams outside 1..8', async () => {
      const layer = createLayer();
      const { code } = await openedRoom(layer);
      await signInAnonymous(layer);
      await expect(layer.rooms.joinRoom(code, 9, 'Pat')).rejects.toBeInstanceOf(Error);
      await expect(layer.rooms.joinRoom(code, 0, 'Pat')).rejects.toBeInstanceOf(Error);
    });
  });
}
