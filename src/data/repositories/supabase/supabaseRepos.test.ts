import { describe, expect, it } from 'vitest';
import { DataError } from '../../errors';
import { createSupabaseAuthService } from './SupabaseAuthService';
import { createSupabaseEventRepo } from './SupabaseEventRepo';
import { createSupabaseRoomRepo } from './SupabaseRoomRepo';
import { createSupabaseSettingsRepo } from './SupabaseSettingsRepo';
import { createFakeSupabase, fail, ok, type FakeResponse, type RecordedCall } from './fakeSupabase';

const EVENT_ROW = {
  id: 'e1',
  owner_id: 'u1',
  name: 'Friday',
  status: 'setup',
  created_at: '2026-10-28T10:00:00Z',
  updated_at: '2026-10-28T10:00:00Z',
};

const EVENT_COLUMNS = 'id, owner_id, name, status, created_at, updated_at';

function methods(call: RecordedCall | undefined): string[] {
  return call?.steps.map((s) => s.method) ?? [];
}

describe('SupabaseEventRepo', () => {
  it('lists events newest first with explicit columns', async () => {
    const fake = createFakeSupabase(() => ok([EVENT_ROW]));
    const events = await createSupabaseEventRepo(fake.client).listEvents();
    expect(events).toEqual([
      {
        id: 'e1',
        ownerId: 'u1',
        name: 'Friday',
        status: 'setup',
        createdAt: '2026-10-28T10:00:00Z',
        updatedAt: '2026-10-28T10:00:00Z',
      },
    ]);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.target).toBe('from:events');
    expect(fake.calls[0]?.steps).toEqual([
      { method: 'select', args: [EVENT_COLUMNS] },
      { method: 'order', args: ['created_at', { ascending: false }] },
    ]);
  });

  it('creates an event by inserting only the trimmed name (owner_id defaults to auth.uid())', async () => {
    const fake = createFakeSupabase(() => ok(EVENT_ROW));
    const event = await createSupabaseEventRepo(fake.client).createEvent('  Friday ');
    expect(event.id).toBe('e1');
    expect(fake.calls[0]?.steps).toEqual([
      { method: 'insert', args: [{ name: 'Friday' }] },
      { method: 'select', args: [EVENT_COLUMNS] },
      { method: 'single', args: [] },
    ]);
  });

  it('getEvent returns null for no row and filters by id', async () => {
    const fake = createFakeSupabase(() => ok(null));
    expect(await createSupabaseEventRepo(fake.client).getEvent('e9')).toBeNull();
    expect(fake.calls[0]?.steps).toContainEqual({ method: 'eq', args: ['id', 'e9'] });
    expect(methods(fake.calls[0])).toEqual(['select', 'eq', 'maybeSingle']);
  });

  it('loadState maps the row and treats a null state as null', async () => {
    const fake = createFakeSupabase(() =>
      ok({ event_id: 'e1', rev: 4, state: null, saved_at: '2026-10-28T11:00:00Z' }),
    );
    const record = await createSupabaseEventRepo(fake.client).loadState('e1');
    expect(record).toEqual({ eventId: 'e1', rev: 4, state: null, savedAt: '2026-10-28T11:00:00Z' });
    expect(fake.calls[0]?.target).toBe('from:event_state');
    expect(fake.calls[0]?.steps).toContainEqual({ method: 'eq', args: ['event_id', 'e1'] });
  });

  it('saveState updates rev and state guarded by the expected rev', async () => {
    const fake = createFakeSupabase(() => ok([{ rev: 3 }]));
    const result = await createSupabaseEventRepo(fake.client).saveState('e1', { teams: [] }, 2);
    expect(result).toEqual({ ok: true, rev: 3 });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.target).toBe('from:event_state');
    expect(fake.calls[0]?.steps).toEqual([
      { method: 'update', args: [{ rev: 3, state: { teams: [] } }] },
      { method: 'eq', args: ['event_id', 'e1'] },
      { method: 'eq', args: ['rev', 2] },
      { method: 'select', args: ['rev'] },
    ]);
  });

  it('saveState reports a conflict when no row matched but the event exists', async () => {
    const fake = createFakeSupabase((call) => (methods(call).includes('update') ? ok([]) : ok({ rev: 9 })));
    const result = await createSupabaseEventRepo(fake.client).saveState('e1', {}, 2);
    expect(result).toEqual({ ok: false, reason: 'conflict' });
    expect(fake.calls).toHaveLength(2);
  });

  it('saveState throws not_found when the event is not visible', async () => {
    const fake = createFakeSupabase((call) => (methods(call).includes('update') ? ok([]) : ok(null)));
    await expect(createSupabaseEventRepo(fake.client).saveState('e1', {}, 0)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('finishEvent sets status and throws not_found on zero rows', async () => {
    const fake = createFakeSupabase(() => ok([{ id: 'e1' }]));
    await createSupabaseEventRepo(fake.client).finishEvent('e1');
    expect(fake.calls[0]?.steps).toEqual([
      { method: 'update', args: [{ status: 'finished' }] },
      { method: 'eq', args: ['id', 'e1'] },
      { method: 'select', args: ['id'] },
    ]);
    const empty = createFakeSupabase(() => ok([]));
    await expect(createSupabaseEventRepo(empty.client).finishEvent('e1')).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('deleteEvent deletes by id', async () => {
    const fake = createFakeSupabase(() => ok(null));
    await createSupabaseEventRepo(fake.client).deleteEvent('e1');
    expect(fake.calls[0]?.target).toBe('from:events');
    expect(fake.calls[0]?.steps).toEqual([
      { method: 'delete', args: [] },
      { method: 'eq', args: ['id', 'e1'] },
    ]);
  });

  it('claimDirector calls the RPC with the SQL parameter names and parses both outcomes', async () => {
    const granted = createFakeSupabase(() => ok({ ok: true }));
    expect(await createSupabaseEventRepo(granted.client).claimDirector('e1', 'tab-1')).toEqual({ ok: true });
    expect(granted.calls).toEqual([
      { target: 'rpc:claim_director', steps: [], rpcArgs: { p_event_id: 'e1', p_session: 'tab-1' } },
    ]);

    const withTtl = createFakeSupabase(() => ok({ ok: true }));
    await createSupabaseEventRepo(withTtl.client).claimDirector('e1', 'tab-1', 45);
    expect(withTtl.calls[0]?.rpcArgs).toEqual({ p_event_id: 'e1', p_session: 'tab-1', p_ttl_seconds: 45 });

    const busy = createFakeSupabase(() => ok({ ok: false, holder_seen_at: '2026-10-28T12:00:00.5+00:00' }));
    expect(await createSupabaseEventRepo(busy.client).claimDirector('e1', 'tab-2')).toEqual({
      ok: false,
      holderSeenAt: '2026-10-28T12:00:00.5+00:00',
    });
    const noStamp = createFakeSupabase(() => ok({ ok: false, holder_seen_at: null }));
    expect(await createSupabaseEventRepo(noStamp.client).claimDirector('e1', 'tab-2')).toEqual({
      ok: false,
      holderSeenAt: null,
    });
  });

  it('claimDirector maps a foreign event to forbidden and rejects odd responses', async () => {
    const foreign = createFakeSupabase(() => fail('event_not_found', '42501'));
    await expect(createSupabaseEventRepo(foreign.client).claimDirector('e1', 'tab-1')).rejects.toMatchObject({
      code: 'forbidden',
    });
    const odd = createFakeSupabase(() => ok('nonsense'));
    await expect(createSupabaseEventRepo(odd.client).claimDirector('e1', 'tab-1')).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('releaseDirector calls release_director with the event and the session', async () => {
    const fake = createFakeSupabase(() => ok(null));
    await createSupabaseEventRepo(fake.client).releaseDirector('e1', 'tab-1');
    expect(fake.calls).toEqual([
      { target: 'rpc:release_director', steps: [], rpcArgs: { p_event_id: 'e1', p_session: 'tab-1' } },
    ]);
    const denied = createFakeSupabase(() => fail('permission denied', '42501'));
    await expect(createSupabaseEventRepo(denied.client).releaseDirector('e1', 'tab-1')).rejects.toMatchObject(
      {
        code: 'forbidden',
      },
    );
  });

  it('maps database errors to DataError codes', async () => {
    const denied = createFakeSupabase(() => fail('permission denied', '42501'));
    const error: unknown = await createSupabaseEventRepo(denied.client)
      .listEvents()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect((error as DataError).code).toBe('forbidden');
  });

  it('rejects rows that do not match the schema', async () => {
    const fake = createFakeSupabase(() => ok([{ id: 'e1' }]));
    await expect(createSupabaseEventRepo(fake.client).listEvents()).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });
});

describe('SupabaseRoomRepo', () => {
  const rpcOnly = (response: FakeResponse) => createFakeSupabase(() => response);

  it('openRoom calls open_room with p_event_id', async () => {
    const fake = rpcOnly(ok('BCDF'));
    expect(await createSupabaseRoomRepo(fake.client).openRoom('e1')).toBe('BCDF');
    expect(fake.calls).toEqual([{ target: 'rpc:open_room', steps: [], rpcArgs: { p_event_id: 'e1' } }]);
  });

  it('openRoom surfaces a permission error', async () => {
    const fake = rpcOnly(fail('event_not_found', '42501'));
    await expect(createSupabaseRoomRepo(fake.client).openRoom('e1')).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('joinRoom normalises the code, sends p_code / p_team / p_nickname and keeps only id, name, color', async () => {
    const fake = rpcOnly(
      ok({
        event_id: 'e1',
        teams: [
          { id: 1, name: 'Red', color: '#f00', players: ['leak'] },
          { id: 'bad', name: 'Broken', color: '#000' },
          { id: 2, name: 'Blue', color: '#00f' },
        ],
      }),
    );
    const result = await createSupabaseRoomRepo(fake.client).joinRoom(' bcdf ', 2, 'Pat');
    expect(fake.calls[0]).toEqual({
      target: 'rpc:join_room',
      steps: [],
      rpcArgs: { p_code: 'BCDF', p_team: 2, p_nickname: 'Pat' },
    });
    expect(result).toEqual({
      ok: true,
      room: {
        code: 'BCDF',
        eventId: 'e1',
        teams: [
          { id: 1, name: 'Red', color: '#f00' },
          { id: 2, name: 'Blue', color: '#00f' },
        ],
      },
    });
  });

  it('joinRoom maps { error } to not_found and the rate limit error to rate_limited', async () => {
    const notFound = rpcOnly(ok({ error: 'room_not_found' }));
    expect(await createSupabaseRoomRepo(notFound.client).joinRoom('BCDF', 1, 'x')).toEqual({
      ok: false,
      reason: 'not_found',
    });

    const byCode = rpcOnly(fail('whatever', 'PT429'));
    expect(await createSupabaseRoomRepo(byCode.client).joinRoom('BCDF', 1, 'x')).toEqual({
      ok: false,
      reason: 'rate_limited',
    });
    const byMessage = rpcOnly(fail('rate_limited'));
    expect(await createSupabaseRoomRepo(byMessage.client).joinRoom('BCDF', 1, 'x')).toEqual({
      ok: false,
      reason: 'rate_limited',
    });
  });

  it('joinRoom throws on other errors and on unexpected payloads', async () => {
    const boom = rpcOnly(fail('invalid_team', '22023'));
    await expect(createSupabaseRoomRepo(boom.client).joinRoom('BCDF', 9, 'x')).rejects.toBeInstanceOf(
      DataError,
    );
    const odd = rpcOnly(ok('nonsense'));
    await expect(createSupabaseRoomRepo(odd.client).joinRoom('BCDF', 1, 'x')).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('joinRoomAsHost, touchRoom and leaveRoom call their RPCs', async () => {
    const fake = rpcOnly(ok(null));
    const repo = createSupabaseRoomRepo(fake.client);
    await repo.joinRoomAsHost(' bcdf');
    await repo.touchRoom('bcdf');
    await repo.leaveRoom();
    expect(fake.calls.map((c) => [c.target, c.rpcArgs])).toEqual([
      ['rpc:join_room_as_host', { p_code: 'BCDF' }],
      ['rpc:touch_room', { p_code: 'BCDF' }],
      ['rpc:leave_room', undefined],
    ]);
  });
});

describe('SupabaseSettingsRepo', () => {
  const row = { feud: { timer: 30 }, wheel: {}, app: {} };

  it('load returns defaults when there is no row', async () => {
    const fake = createFakeSupabase(() => ok(null));
    expect(await createSupabaseSettingsRepo(fake.client).load()).toEqual({ feud: {}, wheel: {}, app: {} });
    expect(fake.calls[0]?.target).toBe('from:host_settings');
    expect(methods(fake.calls[0])).toEqual(['select', 'maybeSingle']);
  });

  it('save upserts only the given groups for the signed-in owner', async () => {
    const fake = createFakeSupabase(() => ok(row), {
      getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }),
    });
    const saved = await createSupabaseSettingsRepo(fake.client).save({ feud: { timer: 30 } });
    expect(saved).toEqual(row);
    expect(fake.calls[0]?.steps).toEqual([
      { method: 'upsert', args: [{ owner_id: 'u1', feud: { timer: 30 } }, { onConflict: 'owner_id' }] },
      { method: 'select', args: ['feud, wheel, app'] },
      { method: 'single', args: [] },
    ]);
  });

  it('save requires a session', async () => {
    const fake = createFakeSupabase(() => ok(row), {
      getSession: () => Promise.resolve({ data: { session: null } }),
    });
    await expect(createSupabaseSettingsRepo(fake.client).save({ app: {} })).rejects.toMatchObject({
      code: 'not_authenticated',
    });
    expect(fake.calls).toHaveLength(0);
  });
});

describe('SupabaseAuthService', () => {
  const user = { id: 'u1', email: 'a@example.com', is_anonymous: false };
  const session = { user, expires_at: 1_800_000_000 };

  it('passes credentials through and maps the session', async () => {
    const seen: [string, unknown][] = [];
    const fake = createFakeSupabase(() => ok(null), {
      signUp: (c) => {
        seen.push(['signUp', c]);
        return Promise.resolve({ data: { session: null, user }, error: null });
      },
      signInWithPassword: (c) => {
        seen.push(['signInWithPassword', c]);
        return Promise.resolve({ data: { session, user }, error: null });
      },
      signInWithOtp: (c) => {
        seen.push(['signInWithOtp', c]);
        return Promise.resolve({ data: { session: null, user: null }, error: null });
      },
      signInAnonymously: () => {
        seen.push(['signInAnonymously', undefined]);
        return Promise.resolve({
          data: {
            session: { user: { id: 'anon', email: undefined, is_anonymous: true }, expires_at: 5 },
            user: null,
          },
          error: null,
        });
      },
    });
    const auth = createSupabaseAuthService(fake.client);

    expect(await auth.signUp('a@example.com', 'pw123456')).toEqual({ ok: true, session: null });
    expect(await auth.signInWithPassword('a@example.com', 'pw123456')).toEqual({
      ok: true,
      session: { user: { id: 'u1', email: 'a@example.com', isAnonymous: false }, expiresAt: 1_800_000_000 },
    });
    expect(await auth.signInWithMagicLink('a@example.com')).toEqual({ ok: true, session: null });
    expect(await auth.signInAnonymously()).toEqual({
      ok: true,
      session: { user: { id: 'anon', email: null, isAnonymous: true }, expiresAt: 5 },
    });
    expect(seen).toEqual([
      ['signUp', { email: 'a@example.com', password: 'pw123456' }],
      ['signInWithPassword', { email: 'a@example.com', password: 'pw123456' }],
      ['signInWithOtp', { email: 'a@example.com' }],
      ['signInAnonymously', undefined],
    ]);
  });

  it('returns failures as values', async () => {
    const fake = createFakeSupabase(() => ok(null), {
      signInWithPassword: () =>
        Promise.resolve({
          data: { session: null, user: null },
          error: { message: 'Invalid login credentials' },
        }),
    });
    expect(await createSupabaseAuthService(fake.client).signInWithPassword('a@example.com', 'x')).toEqual({
      ok: false,
      message: 'Invalid login credentials',
    });
  });

  it('getSession / currentUser / signOut', async () => {
    let signedOut = false;
    const fake = createFakeSupabase(() => ok(null), {
      getSession: () => Promise.resolve({ data: { session }, error: null }),
      signOut: () => {
        signedOut = true;
        return Promise.resolve({ error: null });
      },
    });
    const auth = createSupabaseAuthService(fake.client);
    expect((await auth.getSession())?.user.id).toBe('u1');
    expect(await auth.currentUser()).toEqual({ id: 'u1', email: 'a@example.com', isAnonymous: false });
    await auth.signOut();
    expect(signedOut).toBe(true);
  });

  it('onAuthStateChange maps sessions and unsubscribes', () => {
    let listener: ((event: string, session: unknown) => void) | undefined;
    let unsubscribed = false;
    const fake = createFakeSupabase(() => ok(null), {
      onAuthStateChange: (cb) => {
        listener = cb;
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                unsubscribed = true;
              },
            },
          },
        };
      },
    });
    const seen: (string | null)[] = [];
    const off = createSupabaseAuthService(fake.client).onAuthStateChange((s) =>
      seen.push(s?.user.id ?? null),
    );
    listener?.('SIGNED_IN', session);
    listener?.('SIGNED_OUT', null);
    off();
    expect(seen).toEqual(['u1', null]);
    expect(unsubscribed).toBe(true);
  });
});
