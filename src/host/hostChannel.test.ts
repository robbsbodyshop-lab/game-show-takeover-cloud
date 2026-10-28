import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemoryRoomTransport, ParsedMessage } from '@/realtime';
import { createStageHostChannel, type StageHostChannel } from './hostChannel';
import type { CommandResult, HostCommand, HostSnapshot } from './hostProtocol';
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
let channel: StageHostChannel;
let mirror: FakeBroadcastChannel;
let mirrorMessages: BcMessage[];
let hostMessages: ParsedMessage<'host'>[];

const cmd = (over: Partial<HostCommand> = {}): HostCommand => ({
  cmdId: `c-${String(Math.random())}`,
  target: 'feud',
  gameRev: 1,
  name: 'reveal',
  ...over,
});

const sendRealtime = async (command: HostCommand) => {
  await room.host.publish('host', 'command', {
    cmdId: command.cmdId,
    target: command.target,
    gameRev: command.gameRev,
    name: command.name,
    ...(command.teamId === undefined ? {} : { teamId: command.teamId }),
    ...(command.args === undefined ? {} : { args: command.args }),
  });
  await flush();
};

const sendBroadcast = async (command: HostCommand) => {
  mirror.postMessage({ t: 'command', command });
  await flush();
};

const results = () => hostMessages.flatMap((m) => (m.event === 'result' ? [m.message] : []));
const bcResults = () => mirrorMessages.filter((m) => m.t === 'result');

beforeEach(async () => {
  vi.useFakeTimers();
  FakeBroadcastChannel.reset();
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  room = await connectStageAndHost();
  channel = createStageHostChannel({ transport: room.stage });
  mirror = new FakeBroadcastChannel('gst-host');
  mirrorMessages = [];
  mirror.addEventListener('message', (e) => {
    const parsed = bcMessageSchema.safeParse(e.data);
    if (parsed.success) mirrorMessages.push(parsed.data);
  });
  hostMessages = [];
  room.host.subscribe('host', (m) => hostMessages.push(m));
});

afterEach(() => {
  channel.dispose();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('snapshots', () => {
  it('publishes on the host topic and mirrors on the BroadcastChannel', async () => {
    channel.bridge.publishSnapshot(snap('feud', 3, { round: 2 }));
    await flush();
    const rt = hostMessages.find((m) => m.event === 'snapshot');
    expect(rt?.event === 'snapshot' && rt.message).toMatchObject({
      kind: 'feud',
      gameRev: 3,
      data: { round: 2 },
    });
    const bc = mirrorMessages.find((m) => m.t === 'snapshot');
    expect(bc?.t === 'snapshot' && bc.snapshot).toMatchObject({
      kind: 'feud',
      gameRev: 3,
      data: { round: 2 },
    });
  });

  it('publishHub forces the hub kind', async () => {
    channel.publishHub(snap('feud', 1));
    await flush();
    const bc = mirrorMessages.find((m) => m.t === 'snapshot');
    expect(bc?.t === 'snapshot' && bc.snapshot.kind).toBe('hub');
  });

  it('re-sends the latest snapshot per kind to the realtime path on hello', async () => {
    channel.publishHub(snap('hub', 1));
    channel.bridge.publishSnapshot(snap('feud', 1, { a: 1 }));
    channel.bridge.publishSnapshot(snap('feud', 2, { a: 2 }));
    await flush();
    hostMessages.length = 0;
    mirrorMessages.length = 0;

    await room.host.publish('host', 'hello', { hostId: 'h1' });
    await flush();

    const kinds = hostMessages.flatMap((m) =>
      m.event === 'snapshot' ? [[m.message.kind, m.message.gameRev]] : [],
    );
    expect(kinds).toEqual(
      expect.arrayContaining([
        ['hub', 1],
        ['feud', 2],
      ]),
    );
    expect(kinds).toHaveLength(2);
    // A hello from the transport is answered on the transport only.
    expect(mirrorMessages).toHaveLength(0);
  });

  it('answers a BroadcastChannel hello on the BroadcastChannel', async () => {
    channel.publishHub(snap('hub', 1));
    await flush();
    hostMessages.length = 0;
    mirrorMessages.length = 0;
    mirror.postMessage({ t: 'hello', hostId: 'h2' });
    await flush();
    expect(mirrorMessages.filter((m) => m.t === 'snapshot')).toHaveLength(1);
    expect(hostMessages).toHaveLength(0);
  });

  it('re-sends everything when the transport reports connected again', async () => {
    channel.publishHub(snap('hub', 1));
    await flush();
    hostMessages.length = 0;
    // Only the stage drops, so the host is still listening when the stage comes back.
    const stage = room.stage as MemoryRoomTransport;
    stage.drop('simulated');
    await flush();
    expect(hostMessages).toHaveLength(0);
    stage.restore();
    await flush();
    expect(hostMessages.some((m) => m.event === 'snapshot' && m.message.kind === 'hub')).toBe(true);
  });
});

describe('commands', () => {
  it('routes game commands to the registered handler and replies on the same path', async () => {
    const handler = vi.fn<(c: HostCommand) => CommandResult>(() => ({ applied: true }));
    channel.bridge.onCommand('feud', handler);
    await sendRealtime(cmd({ cmdId: 'a', name: 'reveal', args: { slot: 2 } }));
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ cmdId: 'a', name: 'reveal', args: { slot: 2 } }),
    );
    expect(results()).toEqual([expect.objectContaining({ cmdId: 'a', applied: true })]);
    expect(bcResults()).toHaveLength(0);

    await sendBroadcast(cmd({ cmdId: 'b', name: 'hide' }));
    expect(handler).toHaveBeenCalledTimes(2);
    expect(bcResults()).toEqual([{ t: 'result', cmdId: 'b', applied: true }]);
    expect(results()).toHaveLength(1);
  });

  it('routes hub commands to onHubCommand and carries the rejection reason back', async () => {
    const hubHandler = vi.fn<(c: HostCommand) => CommandResult>(() => ({ applied: false, reason: 'locked' }));
    channel.onHubCommand(hubHandler);
    await sendRealtime(cmd({ cmdId: 'h', target: 'hub', name: 'buzz', teamId: 3 }));
    expect(hubHandler).toHaveBeenCalledTimes(1);
    expect(results()).toEqual([expect.objectContaining({ cmdId: 'h', applied: false, reason: 'locked' })]);
  });

  it('reports no-handler and survives a throwing handler', async () => {
    await sendRealtime(cmd({ cmdId: 'n', target: 'wheel', name: 'spin' }));
    expect(results()[0]).toMatchObject({ applied: false, reason: 'no-handler' });
    channel.bridge.onCommand('feud', () => {
      throw new Error('boom');
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await sendRealtime(cmd({ cmdId: 'e' }));
    expect(results()[1]).toMatchObject({ cmdId: 'e', applied: false, reason: 'error' });
  });

  it('dedupes by cmdId across both paths: applied once, answered on each path', async () => {
    const handler = vi.fn<(c: HostCommand) => CommandResult>(() => ({ applied: true }));
    channel.bridge.onCommand('feud', handler);
    const command = cmd({ cmdId: 'same' });
    await sendRealtime(command);
    await sendBroadcast(command);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(results()).toHaveLength(1);
    expect(bcResults()).toEqual([{ t: 'result', cmdId: 'same', applied: true }]);
  });

  it('drops an identical (target, name, args, teamId) command within 500 ms, then allows it', async () => {
    const handler = vi.fn<(c: HostCommand) => CommandResult>(() => ({ applied: true }));
    channel.bridge.onCommand('feud', handler);
    await sendRealtime(cmd({ cmdId: '1', name: 'strike', args: { a: 1, b: 2 }, teamId: 2 }));
    await vi.advanceTimersByTimeAsync(300);
    await sendRealtime(cmd({ cmdId: '2', name: 'strike', args: { b: 2, a: 1 }, teamId: 2 }));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(results()[1]).toMatchObject({ cmdId: '2', applied: false, reason: 'duplicate' });
    // Different args are a different command.
    await sendRealtime(cmd({ cmdId: '3', name: 'strike', args: { a: 9 }, teamId: 2 }));
    expect(handler).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(600);
    await sendRealtime(cmd({ cmdId: '4', name: 'strike', args: { a: 1, b: 2 }, teamId: 2 }));
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('drops a game command older than the latest snapshot revision, but not hub commands or undo', async () => {
    const game = vi.fn<(c: HostCommand) => CommandResult>(() => ({ applied: true }));
    const hub = vi.fn<(c: HostCommand) => CommandResult>(() => ({ applied: true }));
    channel.bridge.onCommand('feud', game);
    channel.onHubCommand(hub);
    channel.bridge.publishSnapshot(snap('feud', 5));
    channel.publishHub(snap('hub', 9));
    await flush();

    await sendRealtime(cmd({ cmdId: 's1', gameRev: 4, name: 'reveal' }));
    expect(game).not.toHaveBeenCalled();
    expect(results()[0]).toMatchObject({ applied: false, reason: 'stale' });

    await sendRealtime(cmd({ cmdId: 's2', gameRev: 5, name: 'reveal' }));
    expect(game).toHaveBeenCalledTimes(1);

    await sendRealtime(cmd({ cmdId: 's3', gameRev: 1, name: 'undo' }));
    expect(game).toHaveBeenCalledTimes(2);

    await sendRealtime(cmd({ cmdId: 's4', target: 'hub', gameRev: 0, name: 'pause' }));
    expect(hub).toHaveBeenCalledTimes(1);
  });

  it('answers an unknown target without throwing', async () => {
    await room.host.publish('host', 'command', { cmdId: 'u', target: 'bogus', gameRev: 0, name: 'x' });
    await flush();
    expect(results()[0]).toMatchObject({ cmdId: 'u', applied: false, reason: 'unknown-target' });
  });

  it('ignores everything after dispose', async () => {
    const handler = vi.fn<(c: HostCommand) => CommandResult>(() => ({ applied: true }));
    channel.bridge.onCommand('feud', handler);
    channel.dispose();
    await sendRealtime(cmd());
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('without a BroadcastChannel', () => {
  it('still works over the transport', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const bare = createStageHostChannel({ transport: room.stage });
    const handler = vi.fn<(c: HostCommand) => CommandResult>(() => ({ applied: true }));
    bare.onHubCommand(handler);
    bare.publishHub(snap('hub', 1));
    await sendRealtime(cmd({ cmdId: 'solo', target: 'hub', name: 'pause' }));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(hostMessages.some((m) => m.event === 'snapshot' && m.message.kind === 'hub')).toBe(true);
    bare.dispose();
  });
});
