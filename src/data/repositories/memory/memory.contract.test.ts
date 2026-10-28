import { describe, expect, it } from 'vitest';
import { createDataLayer } from '../../index';
import { describeDataLayerContract } from '../repoContract';
import { createMemoryBackend, ROOM_TTL_MS } from './memoryBackend';
import { createMemoryAuthService } from './MemoryAuthService';
import { createMemoryEventRepo } from './MemoryEventRepo';
import { createMemoryRoomRepo } from './MemoryRoomRepo';

describeDataLayerContract('memory', () => createDataLayer('demo'));

describe('memory room rules that need a clock', () => {
  function setup() {
    const clock = { t: Date.UTC(2026, 9, 28, 12, 0, 0) };
    const backend = createMemoryBackend({ now: () => clock.t, random: () => 0, newId: counter() });
    return {
      clock,
      auth: createMemoryAuthService(backend),
      events: createMemoryEventRepo(backend),
      rooms: createMemoryRoomRepo(backend),
    };
  }

  function counter(): () => string {
    let n = 0;
    return () => `id-${String(++n)}`;
  }

  it('generates codes from the injected random source and avoids collisions', async () => {
    const { auth, events, rooms } = setup();
    await auth.signUp('a@example.com', 'correct horse');
    const one = await events.createEvent('One');
    const two = await events.createEvent('Two');
    expect(await rooms.openRoom(one.id)).toBe('BBBB');
    // random() === 0 always yields BBBB, which is taken, so a second room cannot be created.
    await expect(rooms.openRoom(two.id)).rejects.toThrow('exhausted');
  });

  it('expires a room 12 hours after its last activity and then forgets it', async () => {
    const { clock, auth, events, rooms } = setup();
    await auth.signUp('a@example.com', 'correct horse');
    const event = await events.createEvent('Expiry');
    const code = await rooms.openRoom(event.id);

    await auth.signInAnonymously();
    clock.t += ROOM_TTL_MS - 1000;
    expect((await rooms.joinRoom(code, 1, 'Pat')).ok).toBe(true); // joining counts as activity

    clock.t += ROOM_TTL_MS + 1000;
    expect(await rooms.joinRoom(code, 1, 'Pat')).toEqual({ ok: false, reason: 'not_found' });

    // The owner opening the event again after expiry gets a fresh room (purged first).
    await auth.signInWithPassword('a@example.com', 'correct horse');
    const reopened = await rooms.openRoom(event.id);
    expect(reopened).toBe(code); // same deterministic random, but a new room row
    await auth.signInAnonymously();
    expect((await rooms.joinRoom(code, 1, 'Pat')).ok).toBe(true);
  });

  it('forgets failed attempts after 10 minutes', async () => {
    const { clock, auth, events, rooms } = setup();
    await auth.signUp('a@example.com', 'correct horse');
    const event = await events.createEvent('Window');
    const code = await rooms.openRoom(event.id);
    await auth.signInAnonymously();
    for (let i = 0; i < 5; i += 1) await rooms.joinRoom('CCCC', 1, 'x');
    expect(await rooms.joinRoom(code, 1, 'x')).toEqual({ ok: false, reason: 'rate_limited' });
    clock.t += 10 * 60 * 1000 + 1;
    expect((await rooms.joinRoom(code, 1, 'x')).ok).toBe(true);
  });
});
