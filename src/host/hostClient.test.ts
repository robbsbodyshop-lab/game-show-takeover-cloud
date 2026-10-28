import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHostClient, currentSnapshotKind, type HostClient } from './hostClient';
import { createStageHostChannel, type StageHostChannel } from './hostChannel';
import {
  HOST_HELLO_INTERVAL_MS,
  HOST_LOST_CONTACT_MS,
  type CommandResult,
  type HostCommand,
  type HostSnapshot,
} from './hostProtocol';
import { bcMessageSchema, type BcMessage } from './hostWire';
import { connectStageAndHost, FakeBroadcastChannel, type TestRoom } from './testUtils';

const flush = () => vi.advanceTimersByTimeAsync(0);

const snap = (kind: HostSnapshot['kind'], gameRev: number, data: unknown = {}): HostSnapshot => ({
  kind,
  gameRev,
  inputLocked: false,
  data,
});

let room: TestRoom;
let client: HostClient | null = null;
let channel: StageHostChannel | null = null;

beforeEach(async () => {
  vi.useFakeTimers();
  FakeBroadcastChannel.reset();
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  room = await connectStageAndHost();
});

afterEach(() => {
  client?.dispose();
  channel?.dispose();
  client = null;
  channel = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('connection state', () => {
  it('starts looking, goes live on a snapshot and lost after 6 s of silence', async () => {
    client = createHostClient({ transport: room.host, hostId: 'h1' });
    expect(client.connectionState).toBe('looking');

    const stage = new FakeBroadcastChannel('gst-host');
    stage.postMessage({
      t: 'snapshot',
      sent: Date.now(),
      snapshot: snap('hub', 1, { phase: 'hub' }),
    } satisfies BcMessage);
    await flush();
    expect(client.connectionState).toBe('live');
    expect(client.snapshots.hub?.data).toEqual({ phase: 'hub' });

    await vi.advanceTimersByTimeAsync(HOST_LOST_CONTACT_MS - 1);
    expect(client.connectionState).toBe('live');
    await vi.advanceTimersByTimeAsync(1);
    expect(client.connectionState).toBe('lost');
    // The last snapshot stays visible under the banner.
    expect(client.snapshots.hub).toBeDefined();

    stage.postMessage({ t: 'snapshot', sent: Date.now(), snapshot: snap('hub', 2) });
    await flush();
    expect(client.connectionState).toBe('live');
  });

  it('stays "looking" when the stage was never heard', async () => {
    client = createHostClient({ transport: room.host, hostId: 'h1' });
    await vi.advanceTimersByTimeAsync(HOST_LOST_CONTACT_MS * 3);
    expect(client.connectionState).toBe('looking');
  });

  it('notifies subscribers with a new state object each time', async () => {
    client = createHostClient({ hostId: 'h1' });
    const listener = vi.fn();
    const off = client.subscribe(listener);
    const before = client.getState();
    new FakeBroadcastChannel('gst-host').postMessage({ t: 'snapshot', sent: 1, snapshot: snap('hub', 1) });
    await flush();
    expect(listener).toHaveBeenCalled();
    expect(client.getState()).not.toBe(before);
    off();
    listener.mockClear();
    new FakeBroadcastChannel('gst-host').postMessage({ t: 'snapshot', sent: 2, snapshot: snap('hub', 2) });
    await flush();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('hello', () => {
  it('says hello on both paths now and every 2 s', async () => {
    const seen: BcMessage[] = [];
    const listener = new FakeBroadcastChannel('gst-host');
    listener.addEventListener('message', (e) => {
      const p = bcMessageSchema.safeParse(e.data);
      if (p.success) seen.push(p.data);
    });
    const hellos: string[] = [];
    room.stage.subscribe('host', (m) => {
      if (m.event === 'hello') hellos.push(m.message.hostId);
    });
    client = createHostClient({ transport: room.host, hostId: 'h1' });
    await flush();
    expect(hellos).toEqual(['h1']);
    expect(seen.filter((m) => m.t === 'hello')).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(HOST_HELLO_INTERVAL_MS * 2);
    expect(hellos).toHaveLength(3);
    expect(seen.filter((m) => m.t === 'hello')).toHaveLength(3);

    client.dispose();
    await vi.advanceTimersByTimeAsync(HOST_HELLO_INTERVAL_MS * 3);
    expect(hellos).toHaveLength(3);
  });
});

describe('send', () => {
  it('times out after 3 s with reason "timeout" when the stage never answers', async () => {
    client = createHostClient({ transport: room.host, hostId: 'h1' });
    const promise = client.send({ target: 'hub', name: 'pause' });
    let settled: CommandResult | null = null;
    void promise.then((r) => {
      settled = r;
    });
    await vi.advanceTimersByTimeAsync(2999);
    expect(settled).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toEqual({ applied: false, reason: 'timeout' });
  });

  it('stamps the latest gameRev, sends on both paths and resolves with the stage result', async () => {
    channel = createStageHostChannel({ transport: room.stage });
    const handler = vi.fn<(c: HostCommand) => CommandResult>(() => ({ applied: true }));
    channel.bridge.onCommand('feud', handler);
    channel.bridge.publishSnapshot(snap('feud', 7));
    client = createHostClient({ transport: room.host, hostId: 'h1' });
    await flush();
    expect(client.snapshots.feud?.gameRev).toBe(7);

    const result = await Promise.all([client.send({ target: 'feud', name: 'reveal', teamId: 2 }), flush()]);
    expect(result[0]).toEqual({ applied: true });
    // Both paths carried it; the stage applied it once.
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ gameRev: 7, teamId: 2, name: 'reveal' }));
  });

  it('resolves with the rejection reason', async () => {
    channel = createStageHostChannel({ transport: room.stage });
    client = createHostClient({ transport: room.host, hostId: 'h1' });
    const [result] = await Promise.all([client.send({ target: 'wheel', name: 'spin' }), flush()]);
    expect(result).toEqual({ applied: false, reason: 'no-handler' });
  });

  it('works on the BroadcastChannel alone', async () => {
    channel = createStageHostChannel({ transport: room.stage });
    channel.onHubCommand(() => ({ applied: true }));
    client = createHostClient({ hostId: 'h1' });
    const [result] = await Promise.all([client.send({ target: 'hub', name: 'pause' }), flush()]);
    expect(result).toEqual({ applied: true });
  });

  it('settles pending sends when disposed', async () => {
    client = createHostClient({ hostId: 'h1' });
    const pending = client.send({ target: 'hub', name: 'pause' });
    client.dispose();
    await expect(pending).resolves.toEqual({ applied: false, reason: 'disposed' });
    await expect(client.send({ target: 'hub', name: 'pause' })).resolves.toEqual({
      applied: false,
      reason: 'disposed',
    });
  });
});

describe('snapshot ordering', () => {
  it('ignores a late copy that is older than the one it holds', async () => {
    client = createHostClient({ hostId: 'h1' });
    const stage = new FakeBroadcastChannel('gst-host');
    stage.postMessage({ t: 'snapshot', sent: 200, snapshot: snap('feud', 2, 'new') });
    stage.postMessage({ t: 'snapshot', sent: 100, snapshot: snap('feud', 1, 'old') });
    await flush();
    expect(client.snapshots.feud?.data).toBe('new');
  });
});

describe('currentSnapshotKind', () => {
  const state = (
    snapshots: Parameters<typeof currentSnapshotKind>[0]['snapshots'],
    receivedAt: Parameters<typeof currentSnapshotKind>[0]['receivedAt'] = {},
  ) => ({ snapshots, receivedAt, connectionState: 'live' as const });

  it('follows hub.activeGame when the stage declares it', () => {
    const s = state({ hub: snap('hub', 1, { activeGame: 'feud' }), feud: snap('feud', 1) });
    expect(currentSnapshotKind(s)).toBe('feud');
    expect(
      currentSnapshotKind(state({ hub: snap('hub', 1, { activeGame: null }), feud: snap('feud', 1) })),
    ).toBe('hub');
  });

  it('falls back to the most recently received game, then the hub, then nothing', () => {
    expect(
      currentSnapshotKind(
        state(
          { hub: snap('hub', 1), feud: snap('feud', 1), wheel: snap('wheel', 1) },
          { hub: 1, feud: 5, wheel: 9 },
        ),
      ),
    ).toBe('wheel');
    expect(currentSnapshotKind(state({ hub: snap('hub', 1) }, { hub: 1 }))).toBe('hub');
    expect(currentSnapshotKind(state({}))).toBeNull();
  });
});
