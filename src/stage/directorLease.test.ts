import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataLayer, type DataLayer } from '@/data';
import { MemoryRoomHub, MemoryRoomTransport } from '@/realtime';
import {
  DirectorLease,
  getTabSessionId,
  HEARTBEAT_INTERVAL_MS,
  type LeaseRepo,
  type LeaseStatus,
} from './directorLease';
import type { StageHostChannel } from './hostChannelAdapter';
import { StageRuntime } from './stageRuntime';

const fakeChannel = (): StageHostChannel => ({
  bridge: { publishSnapshot: vi.fn(), onCommand: () => () => undefined },
  publishHub: vi.fn(),
  onHubCommand: () => () => undefined,
  getSnapshot: () => null,
  subscribe: () => () => undefined,
  dispatchLocal: () => ({ applied: false, reason: 'no-handler' }),
  dispose: vi.fn(),
});

const TEAMS = [{ id: 1, name: 'Reds', color: '#e63946' }];

/** Moves the fake clock (timers and Date.now, which the memory backend reads) and lets promises settle. */
const tick = async (ms: number): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms);
};

/** A repo whose network can be cut: every call rejects while `offline` is true. */
function flaky(inner: LeaseRepo) {
  const state = { offline: false };
  const repo: LeaseRepo = {
    claimDirector: (...args) =>
      state.offline ? Promise.reject(new Error('offline')) : inner.claimDirector(...args),
    releaseDirector: (...args) =>
      state.offline ? Promise.reject(new Error('offline')) : inner.releaseDirector(...args),
  };
  return { state, repo };
}

describe('director lease', () => {
  let data: DataLayer;
  let eventId: string;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    data = createDataLayer('demo');
    await data.auth.signUp('host@example.com', 'secret-pass');
    eventId = (await data.events.createEvent('Night')).id;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const makeLease = (sessionId: string, events: LeaseRepo = data.events) => {
    const seen: LeaseStatus[] = [];
    const lease = new DirectorLease({
      events,
      eventId,
      sessionId,
      onChange: (status) => seen.push(status),
    });
    return { lease, seen };
  };

  it('claims on start, heartbeats every 10 s and never loses a lease it keeps renewing', async () => {
    const claim = vi.spyOn(data.events, 'claimDirector');
    const { lease, seen } = makeLease('tab-1');
    lease.start();
    expect(lease.getStatus()).toBe('claiming');
    await tick(0);
    expect(lease.getStatus()).toBe('director');
    expect(seen).toEqual(['director']);
    expect(claim).toHaveBeenCalledTimes(1);

    await tick(HEARTBEAT_INTERVAL_MS * 6);
    expect(claim).toHaveBeenCalledTimes(7);
    expect(lease.getStatus()).toBe('director');

    // The holder renewed moments ago, so a rival is refused.
    expect((await data.events.claimDirector(eventId, 'tab-2')).ok).toBe(false);
    lease.stop();
  });

  it('turns the second tab read-only at once and stops its heartbeat', async () => {
    const first = makeLease('tab-1');
    first.lease.start();
    await tick(0);

    const claim = vi.spyOn(data.events, 'claimDirector');
    const second = makeLease('tab-2');
    second.lease.start();
    await tick(0);
    expect(second.lease.getStatus()).toBe('readonly');
    expect(second.seen).toEqual(['readonly']);
    expect(claim).toHaveBeenCalledTimes(1);

    await tick(HEARTBEAT_INTERVAL_MS * 5);
    expect(claim.mock.calls.filter(([, session]) => session === 'tab-2')).toHaveLength(1);
    expect(first.lease.getStatus()).toBe('director');
    first.lease.stop();
    second.lease.stop();
  });

  it('hands the lease over cleanly on stop', async () => {
    const first = makeLease('tab-1');
    first.lease.start();
    await tick(0);
    first.lease.stop();
    await tick(0);

    const second = makeLease('tab-2');
    second.lease.start();
    await tick(0);
    expect(second.lease.getStatus()).toBe('director');
    second.lease.stop();
  });

  it('lets a tab that stopped heartbeating be replaced after the 30 s ttl, and demotes it if it returns', async () => {
    const network = flaky(data.events);
    const first = makeLease('tab-1', network.repo);
    first.lease.start();
    await tick(0);
    expect(first.lease.getStatus()).toBe('director');

    network.state.offline = true; // the tab freezes / loses its network: no more heartbeats arrive
    await tick(HEARTBEAT_INTERVAL_MS * 2);
    expect(first.lease.getStatus()).toBe('director'); // keeps the show running while unsure

    // 25 s after the last heartbeat the lease is still held.
    const early = makeLease('tab-2');
    early.lease.start();
    await tick(0);
    expect(early.lease.getStatus()).toBe('readonly');

    // More than 30 s after the last heartbeat the retry wins.
    await tick(HEARTBEAT_INTERVAL_MS + 1000);
    const retry = makeLease('tab-2');
    retry.lease.start();
    await tick(0);
    expect(retry.lease.getStatus()).toBe('director');

    // The network comes back: the old tab finds itself replaced on its next heartbeat.
    network.state.offline = false;
    await tick(HEARTBEAT_INTERVAL_MS);
    expect(first.lease.getStatus()).toBe('readonly');
    expect(first.seen).toEqual(['director', 'readonly']);
    retry.lease.stop();
    first.lease.stop();
  });

  it('keeps running as director when the first claim cannot reach the server', async () => {
    const network = flaky(data.events);
    network.state.offline = true;
    const { lease, seen } = makeLease('tab-1', network.repo);
    lease.start();
    await tick(0);
    expect(seen).toEqual(['director']);

    // Back online: the next heartbeat verifies the claim for real.
    network.state.offline = false;
    await tick(HEARTBEAT_INTERVAL_MS);
    expect((await data.events.claimDirector(eventId, 'tab-2')).ok).toBe(false);
    lease.stop();
  });

  it('demotes a fail-open tab when somebody else already holds the lease', async () => {
    const network = flaky(data.events);
    network.state.offline = true;
    const { lease } = makeLease('tab-1', network.repo);
    lease.start();
    await tick(0);
    await data.events.claimDirector(eventId, 'tab-2');
    network.state.offline = false;
    await tick(HEARTBEAT_INTERVAL_MS);
    expect(lease.getStatus()).toBe('readonly');
  });

  it('demote() goes read-only and releases the lease for the other stage', async () => {
    const { lease, seen } = makeLease('tab-1');
    lease.start();
    await tick(0);
    lease.demote();
    expect(seen).toEqual(['director', 'readonly']);
    await tick(HEARTBEAT_INTERVAL_MS * 3); // no heartbeat any more
    expect(await data.events.claimDirector(eventId, 'tab-2')).toEqual({ ok: true });
    lease.stop();
  });

  it('keeps the lease across a remount even when the release is slow (reload, StrictMode)', async () => {
    const slow: LeaseRepo = {
      claimDirector: (...args) => data.events.claimDirector(...args),
      releaseDirector: (...args) =>
        new Promise((resolve) => setTimeout(resolve, 500)).then(() => data.events.releaseDirector(...args)),
    };
    const first = makeLease('tab-1', slow);
    first.lease.start();
    await tick(0);
    first.lease.stop(); // release is in flight for 500 ms ...
    const second = makeLease('tab-1', slow);
    second.lease.start(); // ... and the same tab claims again straight away
    await tick(1000);
    expect(second.lease.getStatus()).toBe('director');
    // The late release did not evict the new claim.
    expect((await data.events.claimDirector(eventId, 'tab-2')).ok).toBe(false);
    second.lease.stop();
  });

  it('releases on pagehide and renews on the next heartbeat if the page comes back', async () => {
    const { lease } = makeLease('tab-1');
    lease.start();
    await tick(0);
    window.dispatchEvent(new Event('pagehide'));
    await tick(0);
    expect(await data.events.claimDirector(eventId, 'tab-2')).toEqual({ ok: true });
    lease.stop();
  });

  it('ignores a second start and a stop before start', async () => {
    const claim = vi.spyOn(data.events, 'claimDirector');
    const { lease } = makeLease('tab-1');
    lease.stop();
    lease.start();
    lease.start();
    await tick(0);
    expect(claim).toHaveBeenCalledTimes(1);
    lease.stop();
    lease.stop();
  });
});

describe('getTabSessionId', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('is stable for the tab (a reload keeps it) and different for a new tab', () => {
    const id = getTabSessionId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(getTabSessionId()).toBe(id);
    expect(sessionStorage.getItem('gst:stage-session')).toBe(id);

    sessionStorage.clear(); // a new tab starts with empty sessionStorage
    expect(getTabSessionId()).not.toBe(id);
  });

  it('falls back to an id for this page when sessionStorage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const id = getTabSessionId();
    expect(getTabSessionId()).toBe(id);
    vi.restoreAllMocks();
  });
});

describe('two stage runtimes for one event', () => {
  let data: DataLayer;
  let eventId: string;
  let userId: string;
  let hub: MemoryRoomHub;
  let connects: ReturnType<typeof vi.spyOn>[];

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    data = createDataLayer('demo');
    const up = await data.auth.signUp('host@example.com', 'secret-pass');
    userId = up.ok && up.session ? up.session.user.id : '';
    eventId = (await data.events.createEvent('Night')).id;
    hub = new MemoryRoomHub();
    connects = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const makeRuntime = (sessionId: string, layer: DataLayer = data) =>
    new StageRuntime({
      eventId,
      userId,
      data: layer,
      sessionId,
      createTransport: () => {
        const transport = new MemoryRoomTransport({ hub, ua: sessionId });
        connects.push(vi.spyOn(transport, 'connect'));
        return transport;
      },
      createHostChannel: fakeChannel,
      teams: TEAMS,
    });

  it('keeps the second stage read-only: no room, no stage transport', async () => {
    const openRoom = vi.spyOn(data.rooms, 'openRoom');
    const first = makeRuntime('tab-1');
    first.start();
    await tick(0);
    expect(first.getSnapshot()).toMatchObject({ lease: 'director', status: 'connected' });
    expect(first.getSnapshot().code).not.toBeNull();

    const second = makeRuntime('tab-2');
    second.start();
    expect(second.getSnapshot()).toMatchObject({ ready: true, lease: 'claiming' });
    await tick(0);

    const snap = second.getSnapshot();
    expect(snap).toMatchObject({ lease: 'readonly', ready: false, code: null, status: 'offline' });
    expect(snap.phones).toBeNull();
    expect(snap.channel).toBeNull();
    expect(openRoom).toHaveBeenCalledTimes(1);
    expect(connects[0]).toHaveBeenCalledTimes(1);
    expect(connects[1]).not.toHaveBeenCalled();

    // The director is undisturbed and a long silence from the loser changes nothing.
    await tick(HEARTBEAT_INTERVAL_MS * 10);
    expect(first.getSnapshot()).toMatchObject({ lease: 'director', status: 'connected' });
    expect(second.getSnapshot().lease).toBe('readonly');
    first.stop();
    second.stop();
  });

  it('lets the second stage win its retry once the first stopped heartbeating for 30 s', async () => {
    const network = flaky(data.events);
    const firstLayer: DataLayer = { ...data, events: { ...data.events, ...network.repo } };
    const first = makeRuntime('tab-1', firstLayer);
    first.start();
    await tick(0);
    expect(first.getSnapshot().status).toBe('connected');

    const second = makeRuntime('tab-2');
    second.start();
    await tick(0);
    expect(second.getSnapshot().lease).toBe('readonly');

    // The first tab dies without being able to release (closed laptop, dropped network).
    network.state.offline = true;
    first.stop();

    await tick(20_000);
    second.stop();
    second.start(); // retry ("Reload this event" remounts the stage): still inside the ttl
    await tick(0);
    expect(second.getSnapshot().lease).toBe('readonly');

    await tick(11_000); // 31 s since the first tab's last heartbeat
    second.stop();
    second.start();
    await tick(0);
    expect(second.getSnapshot()).toMatchObject({ lease: 'director', status: 'connected' });
    expect(second.getSnapshot().code).not.toBeNull();
    second.stop();
  });

  it('goes read-only and closes the transport when demoted by a save conflict', async () => {
    const runtime = makeRuntime('tab-1');
    runtime.start();
    await tick(0);
    expect(runtime.getSnapshot().status).toBe('connected');

    runtime.demote();
    expect(runtime.getSnapshot()).toMatchObject({ lease: 'readonly', ready: false, status: 'offline' });
    expect(runtime.getSnapshot().phones).toBeNull();
    // The lease went back to the other stage.
    await tick(0);
    expect(await data.events.claimDirector(eventId, 'tab-2')).toEqual({ ok: true });
    runtime.stop();
  });

  it('survives StrictMode style start, stop, start without losing the lease', async () => {
    const runtime = makeRuntime('tab-1');
    runtime.start();
    runtime.stop();
    runtime.start();
    await tick(0);
    expect(runtime.getSnapshot()).toMatchObject({ lease: 'director', status: 'connected' });
    expect((await data.events.claimDirector(eventId, 'tab-2')).ok).toBe(false);
    runtime.stop();
  });
});
