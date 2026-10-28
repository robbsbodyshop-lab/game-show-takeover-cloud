import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { logger } from '../lib/logger';
import { MemoryRoomHub, MemoryRoomTransport } from './MemoryRoomTransport';
import type { ConnectionStatus } from './RoomTransport';
import { createRoomTransport } from './index';
import { runTransportContract, type ContractHarness } from './transportContract';

const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

function memoryHarness(): ContractHarness {
  const hub = new MemoryRoomHub();
  const code = 'BKDX';
  return {
    code,
    createTransport: () => new MemoryRoomTransport({ hub, ua: 'contract-ua' }),
    settle,
    drop: async () => {
      hub.simulateDisconnect(code);
      await settle();
    },
    recover: async () => {
      hub.simulateReconnect(code);
      await settle();
    },
    teardown: () => undefined,
  };
}

runTransportContract('memory', memoryHarness);

describe('MemoryRoomHub', () => {
  it('accepts non-production demo codes (design.md FAQ uses ?room=DEMO)', async () => {
    const hub = new MemoryRoomHub();
    const stage = new MemoryRoomTransport({ hub });
    const phone = new MemoryRoomTransport({ hub });
    await stage.connect({ code: 'DEMO', role: 'stage' });
    await phone.connect({ code: 'DEMO', role: 'phone', team: 1 });
    const seen: string[] = [];
    phone.subscribe('stage', (m) => seen.push(m.event));
    await stage.publish('stage', 'audience', { phase: 'x', paused: false, scores: [] });
    await settle();
    expect(seen).toEqual(['audience']);
    expect(hub.clientCount('DEMO')).toBe(2);
  });

  it('forgets rooms when the last client leaves', async () => {
    const hub = new MemoryRoomHub();
    const t = new MemoryRoomTransport({ hub });
    await t.connect({ code: 'BKDX', role: 'stage' });
    await t.disconnect();
    expect(hub.clientCount('BKDX')).toBe(0);
  });

  it('simulateDisconnect can reconnect on its own after a delay', async () => {
    vi.useFakeTimers();
    try {
      const hub = new MemoryRoomHub();
      const t = new MemoryRoomTransport({ hub });
      const seen: ConnectionStatus[] = [];
      t.onStatus((s) => seen.push(s));
      await t.connect({ code: 'BKDX', role: 'stage' });
      hub.simulateDisconnect('BKDX', { reconnectAfterMs: 3000 });
      expect(t.status).toBe('reconnecting');
      await vi.advanceTimersByTimeAsync(2999);
      expect(t.status).toBe('reconnecting');
      await vi.advanceTimersByTimeAsync(1);
      expect(t.status).toBe('connected');
      expect(seen).toEqual(['connecting', 'connected', 'reconnecting', 'connected']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores simulate calls for unknown rooms', () => {
    const hub = new MemoryRoomHub();
    expect(() => {
      hub.simulateDisconnect('NONE');
      hub.simulateReconnect('NONE');
    }).not.toThrow();
  });

  it('validates what it receives, so a forged message through the hub is dropped', async () => {
    const hub = new MemoryRoomHub();
    const stage = new MemoryRoomTransport({ hub });
    const phone = new MemoryRoomTransport({ hub });
    await stage.connect({ code: 'BKDX', role: 'stage' });
    await phone.connect({ code: 'BKDX', role: 'phone', team: 1 });
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const seen: unknown[] = [];
    stage.subscribe('phones', (m) => seen.push(m));
    // Bypass the publish guard the way a malicious client could.
    hub.deliver(
      'BKDX',
      'phones',
      'press',
      { v: 1, from: 'stage', sent: 1, pressId: 'p', team: 1, at: 1 },
      phone,
    );
    await settle();
    expect(seen).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('createRoomTransport', () => {
  it('builds a memory transport', () => {
    const t = createRoomTransport('memory', { hub: new MemoryRoomHub() });
    expect(t).toBeInstanceOf(MemoryRoomTransport);
    expect(t.status).toBe('offline');
  });
});

describe('type safety (checked by tsc)', () => {
  it('narrows publish payloads and subscribe messages per topic and event', async () => {
    const t = new MemoryRoomTransport({ hub: new MemoryRoomHub() });
    await t.connect({ code: 'BKDX', role: 'phone', team: 1 });
    await t.publish('phones', 'press', { pressId: 'p', team: 1, at: 1 });
    // @ts-expect-error `press` is not an event of the stage topic
    await t.publish('stage', 'press', { pressId: 'p', team: 1, at: 1 });
    // @ts-expect-error `accepted` is required for `ack`
    await t.publish('stage', 'ack', { team: 1, pressId: 'p' });
    // @ts-expect-error the envelope is added by the transport, not the caller
    await t.publish('phones', 'press', { pressId: 'p', team: 1, at: 1, from: 'phone' });
    t.subscribe('stage', (msg) => {
      if (msg.event === 'ack') expectTypeOf(msg.message.accepted).toEqualTypeOf<boolean>();
      if (msg.event === 'controls') expectTypeOf(msg.message.activeTeam).toEqualTypeOf<number | null>();
    });
    t.subscribe('host', (msg) => {
      if (msg.event === 'result') expectTypeOf(msg.message.applied).toEqualTypeOf<boolean>();
    });
    expect(true).toBe(true);
  });
});
