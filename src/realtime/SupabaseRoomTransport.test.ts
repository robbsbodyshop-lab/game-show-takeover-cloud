import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { logger } from '../lib/logger';
import { FakeRealtimeBackend, type FakeSupabaseClient } from './fakeSupabase';
import { createRoomTransport } from './index';
import type { ConnectionStatus, PresenceEntry } from './RoomTransport';
import {
  RECONNECT_MAX_MS,
  SupabaseRoomTransport,
  backoffDelay,
  type SupabaseLike,
} from './SupabaseRoomTransport';
import { runTransportContract, type ContractHarness } from './transportContract';

// Compile-time proof that the real client satisfies the structural slice the transport uses.
export const realClientIsAccepted = (client: SupabaseClient): SupabaseLike => client;

const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

let keyCounter = 0;
const nextKey = (): string => `key-${String(++keyCounter)}`;

function supabaseHarness(): ContractHarness {
  vi.useFakeTimers();
  const backend = new FakeRealtimeBackend();
  const code = 'BKDX';
  return {
    code,
    createTransport: () =>
      new SupabaseRoomTransport({ client: backend.createClient(), ua: 'contract-ua', randomKey: nextKey }),
    settle,
    drop: async () => {
      backend.drop(code);
      await settle();
    },
    recover: async () => {
      backend.restore();
      await vi.advanceTimersByTimeAsync(1000);
      await settle();
    },
    teardown: () => {
      vi.useRealTimers();
    },
  };
}

runTransportContract('supabase (fake client)', supabaseHarness);

describe('SupabaseRoomTransport', () => {
  const CODE = 'BKDX';
  let backend: FakeRealtimeBackend;
  let client: FakeSupabaseClient;
  let warn: MockInstance<typeof logger.warn>;

  const make = (overrides: { now?: () => number; c?: FakeSupabaseClient } = {}): SupabaseRoomTransport =>
    new SupabaseRoomTransport({
      client: overrides.c ?? client,
      ua: 'test-ua',
      now: overrides.now ?? (() => 1_700_000_000_000),
      randomKey: nextKey,
    });

  beforeEach(() => {
    vi.useFakeTimers();
    backend = new FakeRealtimeBackend();
    client = backend.createClient();
    warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('channels', () => {
    it.each([
      ['stage', ['room:BKDX:stage', 'room:BKDX:phones', 'room:BKDX:host']],
      ['host', ['room:BKDX:stage', 'room:BKDX:host']],
      ['phone', ['room:BKDX:stage', 'room:BKDX:phones']],
    ] as const)('opens the right private channels for %s', async (role, topics) => {
      const t = make();
      await t.connect({ code: CODE, role, team: 1, key: 'k-1' });
      expect(client.created.map((c) => c.topic)).toEqual(topics);
      for (const channel of client.created) {
        expect(channel.options).toEqual({ config: { private: true, presence: { key: 'k-1' } } });
      }
    });

    it('uses a generated presence key when none is given', async () => {
      const t = make();
      await t.connect({ code: CODE, role: 'stage' });
      expect(client.created[0]?.key).toMatch(/^key-\d+$/);
    });

    it('rejects a code that is not 4 consonants', async () => {
      const t = make();
      await expect(t.connect({ code: 'DEMO', role: 'stage' })).rejects.toThrow(/room code/);
      expect(t.status).toBe('error');
      expect(client.created).toEqual([]);
    });
  });

  describe('subscribe status mapping', () => {
    it('is connecting until every channel is SUBSCRIBED', async () => {
      backend.joinOverride = (topic) => (topic === 'room:BKDX:phones' ? 'PENDING' : undefined);
      const t = make();
      const pending = t.connect({ code: CODE, role: 'phone', team: 1 });
      const outcome = expect(pending).rejects.toThrow(/disconnected/);
      await settle();
      expect(t.status).toBe('connecting');
      await t.disconnect();
      await outcome;
    });

    it('SUBSCRIBED on all channels gives connected', async () => {
      const t = make();
      const seen: [ConnectionStatus, string | undefined][] = [];
      t.onStatus((s, d) => seen.push([s, d]));
      await t.connect({ code: CODE, role: 'phone', team: 1 });
      expect(seen).toEqual([
        ['connecting', undefined],
        ['connected', undefined],
      ]);
    });

    it.each(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'] as const)(
      'first attempt %s -> status error, connect rejects, nothing keeps retrying',
      async (outcome) => {
        backend.joinOverride = (topic) => (topic.endsWith(':stage') ? outcome : undefined);
        const t = make();
        const seen: [ConnectionStatus, string | undefined][] = [];
        t.onStatus((s, d) => seen.push([s, d]));
        await expect(t.connect({ code: CODE, role: 'phone', team: 1 })).rejects.toThrow(/could not connect/);
        expect(t.status).toBe('error');
        expect(seen.at(-1)?.[0]).toBe('error');
        expect(seen.at(-1)?.[1]).toContain(outcome === 'CLOSED' ? 'CLOSED' : 'fake');
        expect(client.authListeners.size).toBe(0);
        const before = client.created.length;
        await vi.advanceTimersByTimeAsync(60_000);
        expect(client.created.length).toBe(before);
        // Every channel it did create was removed again.
        expect(client.open).toEqual([]);
      },
    );

    it.each(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'] as const)(
      '%s after connecting -> reconnecting with detail, then connected again',
      async (outcome) => {
        const t = make();
        await t.connect({ code: CODE, role: 'stage' });
        const seen: [ConnectionStatus, string | undefined][] = [];
        t.onStatus((s, d) => seen.push([s, d]));
        backend.drop('', outcome);
        backend.restore();
        expect(t.status).toBe('reconnecting');
        expect(seen).toHaveLength(1);
        expect(seen[0]?.[1]).toContain(outcome);
        await vi.advanceTimersByTimeAsync(1000);
        await settle();
        expect(t.status).toBe('connected');
        expect(seen.map(([s]) => s)).toEqual(['reconnecting', 'connected']);
      },
    );

    it('treats several channels failing at once as one drop', async () => {
      const t = make();
      await t.connect({ code: CODE, role: 'stage' });
      const seen: ConnectionStatus[] = [];
      t.onStatus((s) => seen.push(s));
      backend.drop();
      expect(seen).toEqual(['reconnecting']);
      backend.restore();
      await vi.advanceTimersByTimeAsync(1000);
      await settle();
      // One rebuild: 3 original + 3 new channels.
      expect(client.created).toHaveLength(6);
    });
  });

  describe('reconnection scheduling', () => {
    it('backoffDelay is 1s, 2s, 4s, 8s, then capped at 10s', () => {
      expect([0, 1, 2, 3, 4, 5, 20].map(backoffDelay)).toEqual([
        1000, 2000, 4000, 8000, 10_000, 10_000, 10_000,
      ]);
      expect(RECONNECT_MAX_MS).toBe(10_000);
    });

    it('retries with growing delays while the server stays away, and resets after success', async () => {
      const t = make();
      await t.connect({ code: CODE, role: 'phone', team: 1 });
      const attempts = (): number => client.created.length;
      expect(attempts()).toBe(2);

      backend.drop(); // offline: every rejoin times out
      expect(t.status).toBe('reconnecting');

      const expectedWaits = [1000, 2000, 4000, 8000, 10_000, 10_000];
      let created = attempts();
      for (const wait of expectedWaits) {
        await vi.advanceTimersByTimeAsync(wait - 1);
        expect(attempts()).toBe(created); // not yet
        await vi.advanceTimersByTimeAsync(1);
        await settle();
        created += 2; // phone: stage + phones channels per attempt
        expect(attempts()).toBe(created);
        expect(t.status).toBe('reconnecting');
      }

      backend.restore();
      await vi.advanceTimersByTimeAsync(10_000);
      await settle();
      expect(t.status).toBe('connected');

      // A new drop starts again from 1 s.
      created = attempts();
      backend.drop();
      backend.restore();
      await vi.advanceTimersByTimeAsync(999);
      expect(attempts()).toBe(created);
      await vi.advanceTimersByTimeAsync(1);
      await settle();
      expect(t.status).toBe('connected');
    });

    it('removes the dead channels before rebuilding', async () => {
      const t = make();
      await t.connect({ code: CODE, role: 'stage' });
      const first = [...client.created];
      backend.drop();
      backend.restore();
      await vi.advanceTimersByTimeAsync(1000);
      await settle();
      expect(client.removed).toEqual(expect.arrayContaining(first));
      expect(client.open).toHaveLength(3);
    });

    it('disconnect during backoff cancels the retry', async () => {
      const t = make();
      await t.connect({ code: CODE, role: 'stage' });
      backend.drop();
      expect(t.status).toBe('reconnecting');
      await t.disconnect();
      expect(t.status).toBe('offline');
      const before = client.created.length;
      backend.restore();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(client.created.length).toBe(before);
      expect(t.status).toBe('offline');
    });

    it('ignores late callbacks from a replaced channel generation', async () => {
      const t = make();
      await t.connect({ code: CODE, role: 'stage' });
      const old = client.created[0];
      backend.drop();
      backend.restore();
      await vi.advanceTimersByTimeAsync(1000);
      await settle();
      const seen: ConnectionStatus[] = [];
      t.onStatus((s) => seen.push(s));
      // A straggler close from the dead channel must not knock the live connection over.
      old?.straggle('CLOSED');
      old?.receive('audience', { v: 1, from: 'stage', sent: 1, phase: 'ghost', paused: false, scores: [] });
      expect(seen).toEqual([]);
      expect(t.status).toBe('connected');
    });

    it('disconnect while the first connect is pending rejects connect', async () => {
      const t = make();
      const pending = t.connect({ code: CODE, role: 'stage' });
      const outcome = expect(pending).rejects.toThrow(/disconnected/);
      await t.disconnect();
      await outcome;
      expect(t.status).toBe('offline');
    });
  });

  describe('publish', () => {
    it('sends a broadcast with the envelope added', async () => {
      const t = make({ now: () => 1_700_000_000_123 });
      await t.connect({ code: CODE, role: 'phone', team: 3 });
      await t.publish('phones', 'press', { pressId: 'p-1', team: 3, at: 99 });
      const channel = client.created.find((c) => c.topic === 'room:BKDX:phones');
      expect(channel?.sent).toEqual([
        {
          event: 'press',
          payload: { pressId: 'p-1', team: 3, at: 99, v: 1, from: 'phone', sent: 1_700_000_000_123 },
        },
      ]);
    });

    it('sends on the channel of the requested topic', async () => {
      const t = make();
      await t.connect({ code: CODE, role: 'stage' });
      await t.publish('host', 'result', { cmdId: 'c', applied: true });
      await t.publish('stage', 'ack', { team: 1, pressId: 'p', accepted: true });
      const byTopic = Object.fromEntries(client.created.map((c) => [c.topic, c.sent.map((s) => s.event)]));
      expect(byTopic).toEqual({
        'room:BKDX:stage': ['ack'],
        'room:BKDX:phones': [],
        'room:BKDX:host': ['result'],
      });
    });

    it('does not touch the network when the role guard rejects', async () => {
      const t = make();
      await t.connect({ code: CODE, role: 'phone', team: 1 });
      await (t.publish as (t: string, e: string, p: unknown) => Promise<void>)('stage', 'controls', {});
      expect(client.created.flatMap((c) => c.sent)).toEqual([]);
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('rejects when the server does not accept the send', async () => {
      const t = make();
      await t.connect({ code: CODE, role: 'stage' });
      backend.sendResult = 'timed out';
      await expect(t.publish('stage', 'audience', { phase: 'x', paused: false, scores: [] })).rejects.toThrow(
        /timed out/,
      );
    });

    it('drops with a warning while reconnecting', async () => {
      const t = make();
      await t.connect({ code: CODE, role: 'stage' });
      backend.drop();
      warn.mockClear();
      await t.publish('stage', 'audience', { phase: 'x', paused: false, scores: [] });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(client.created.flatMap((c) => c.sent)).toEqual([]);
    });
  });

  describe('inbound validation', () => {
    it('drops malformed or mis-attributed broadcasts and keeps the good ones', async () => {
      const t = make();
      await t.connect({ code: CODE, role: 'phone', team: 1 });
      const seen: string[] = [];
      t.subscribe('stage', (m) => seen.push(m.event));
      const stageChannel = client.created.find((c) => c.topic === 'room:BKDX:stage');
      stageChannel?.receive('audience', {
        v: 1,
        from: 'stage',
        sent: 1,
        phase: 'a',
        paused: false,
        scores: [],
      });
      stageChannel?.receive('audience', {
        v: 1,
        from: 'phone',
        sent: 1,
        phase: 'a',
        paused: false,
        scores: [],
      });
      stageChannel?.receive('audience', 'garbage');
      stageChannel?.receive('audience', undefined);
      expect(seen).toEqual(['audience']);
      expect(warn).toHaveBeenCalled();
    });

    it('does not listen to topics its role cannot read', async () => {
      const t = make();
      await t.connect({ code: CODE, role: 'phone', team: 1 });
      const phonesChannel = client.created.find((c) => c.topic === 'room:BKDX:phones');
      const hostSeen: unknown[] = [];
      const unsubscribe = t.subscribe('phones', (m) => hostSeen.push(m));
      unsubscribe();
      phonesChannel?.receive('press', { v: 1, from: 'phone', sent: 1, pressId: 'p', team: 1, at: 1 });
      expect(hostSeen).toEqual([]);
    });
  });

  describe('presence', () => {
    it('phones track { team, nickname, ua } on the phones channel only', async () => {
      const t = make();
      await t.connect({ code: CODE, role: 'phone', team: 4, nickname: 'Dee' });
      const tracked = Object.fromEntries(client.created.map((c) => [c.topic, c.tracked]));
      expect(tracked).toEqual({
        'room:BKDX:stage': [],
        'room:BKDX:phones': [{ team: 4, nickname: 'Dee', ua: 'test-ua' }],
      });
    });

    it('host views track on the host channel only', async () => {
      const t = make();
      await t.connect({ code: CODE, role: 'host', nickname: 'Hosty' });
      const tracked = Object.fromEntries(client.created.map((c) => [c.topic, c.tracked]));
      expect(tracked).toEqual({
        'room:BKDX:stage': [],
        'room:BKDX:host': [{ team: 0, nickname: 'Hosty', ua: 'test-ua' }],
      });
    });

    it('the stage tracks nothing but listens on phones and host', async () => {
      const t = make();
      await t.connect({ code: CODE, role: 'stage' });
      expect(client.created.flatMap((c) => c.tracked)).toEqual([]);
    });

    it('re-tracks after a reconnect', async () => {
      const t = make();
      await t.connect({ code: CODE, role: 'phone', team: 2, nickname: 'Eve' });
      backend.drop();
      backend.restore();
      await vi.advanceTimersByTimeAsync(1000);
      await settle();
      expect(client.created.flatMap((c) => c.tracked)).toHaveLength(2);
    });

    it('ignores presence entries that fail validation', async () => {
      const stage = make();
      let roster: PresenceEntry[] = [];
      stage.onPresence((r) => {
        roster = r;
      });
      await stage.connect({ code: CODE, role: 'stage' });
      backend.setPresence('room:BKDX:phones', 'bad', { team: 99, nickname: 'x', ua: 'x' });
      backend.setPresence('room:BKDX:phones', 'good', { team: 2, nickname: 'ok', ua: 'x' });
      await settle();
      expect(roster.map((e) => e.key)).toEqual(['good']);
      expect(warn).toHaveBeenCalled();
    });
  });

  describe('token refresh', () => {
    it('calls realtime.setAuth with the new token on TOKEN_REFRESHED and SIGNED_IN', async () => {
      const t = make();
      await t.connect({ code: CODE, role: 'stage' });
      client.emitAuth('TOKEN_REFRESHED', { access_token: 'jwt-2' });
      client.emitAuth('SIGNED_IN', { access_token: 'jwt-3' });
      expect(client.authTokens).toEqual(['jwt-2', 'jwt-3']);
    });

    it('ignores other auth events and a missing session', async () => {
      const t = make();
      await t.connect({ code: CODE, role: 'stage' });
      client.emitAuth('SIGNED_OUT', null);
      client.emitAuth('TOKEN_REFRESHED', null);
      client.emitAuth('USER_UPDATED', { access_token: 'x' });
      client.emitAuth('INITIAL_SESSION', { access_token: 'x' });
      expect(client.authTokens).toEqual([]);
    });

    it('stops listening after disconnect', async () => {
      const t = make();
      await t.connect({ code: CODE, role: 'stage' });
      expect(client.authListeners.size).toBe(1);
      await t.disconnect();
      expect(client.authListeners.size).toBe(0);
      client.emitAuth('TOKEN_REFRESHED', { access_token: 'late' });
      expect(client.authTokens).toEqual([]);
    });

    it('does not stack listeners across reconnects', async () => {
      const t = make();
      await t.connect({ code: CODE, role: 'stage' });
      backend.drop();
      backend.restore();
      await vi.advanceTimersByTimeAsync(1000);
      await settle();
      expect(client.authListeners.size).toBe(1);
    });

    it('logs a failing setAuth instead of throwing', async () => {
      const t = make();
      await t.connect({ code: CODE, role: 'stage' });
      client.setAuthError = new Error('nope');
      client.emitAuth('TOKEN_REFRESHED', { access_token: 'jwt' });
      await settle();
      expect(warn).toHaveBeenCalledWith('[realtime] setAuth failed', expect.any(Error));
    });
  });

  describe('createRoomTransport', () => {
    it('builds a supabase transport from an injected client', () => {
      const t = createRoomTransport('supabase', { client });
      expect(t).toBeInstanceOf(SupabaseRoomTransport);
      expect(t.status).toBe('offline');
    });
  });
});
