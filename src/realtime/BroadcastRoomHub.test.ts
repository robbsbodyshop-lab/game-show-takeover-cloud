import { describe, expect, it } from 'vitest';
import { BroadcastRoomHub, type RelayChannel } from './BroadcastRoomHub';
import { MemoryRoomTransport } from './MemoryRoomTransport';
import type { PresenceEntry } from './RoomTransport';
import type { ParsedMessage } from './schemas';

/** Same-origin channel stand-in: delivers a structured clone to every other open instance, async. */
class FakeNetwork {
  private readonly channels = new Set<FakeChannel>();
  open(): RelayChannel {
    const channel = new FakeChannel(this);
    this.channels.add(channel);
    return channel;
  }
  post(from: FakeChannel, data: unknown): void {
    const copy = structuredClone(data);
    for (const channel of this.channels) {
      if (channel !== from)
        queueMicrotask(() => {
          channel.emit(copy);
        });
    }
  }
  remove(channel: FakeChannel): void {
    this.channels.delete(channel);
  }
}

class FakeChannel implements RelayChannel {
  private readonly listeners = new Set<(event: { data: unknown }) => void>();
  private closed = false;
  constructor(private readonly network: FakeNetwork) {}
  postMessage(data: unknown): void {
    if (!this.closed) this.network.post(this, data);
  }
  addEventListener(_type: 'message', listener: (event: { data: unknown }) => void): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'message', listener: (event: { data: unknown }) => void): void {
    this.listeners.delete(listener);
  }
  close(): void {
    this.closed = true;
    this.network.remove(this);
  }
  emit(data: unknown): void {
    if (this.closed) return;
    for (const listener of [...this.listeners]) listener({ data });
  }
}

const flush = async (): Promise<void> => {
  // Relay hop + transport microtask + roster microtask.
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};

const setup = () => {
  const network = new FakeNetwork();
  const make = (hubId: string) => new BroadcastRoomHub({ hubId, channelFactory: () => network.open() });
  return { network, tabA: make('A'), tabB: make('B') };
};

describe('BroadcastRoomHub', () => {
  it('carries a phone press from one tab to a stage in another', async () => {
    const { tabA, tabB } = setup();
    const stage = new MemoryRoomTransport({ hub: tabA });
    const phone = new MemoryRoomTransport({ hub: tabB });
    await stage.connect({ code: 'DMKT', role: 'stage' });
    await phone.connect({ code: 'DMKT', role: 'phone', team: 3, key: 'phone-1' });

    const seen: ParsedMessage<'phones'>[] = [];
    stage.subscribe('phones', (msg) => seen.push(msg));
    await phone.publish('phones', 'press', { pressId: 'p1', team: 3, at: 1000 });
    await flush();

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      event: 'press',
      topicTeam: 3,
      message: { pressId: 'p1', team: 3, from: 'phone' },
    });
  });

  it('keeps the phones topic team across tabs and drops a forged team there too', async () => {
    const { tabA, tabB } = setup();
    const stage = new MemoryRoomTransport({ hub: tabA });
    const phone = new MemoryRoomTransport({ hub: tabB });
    await stage.connect({ code: 'DMKT', role: 'stage' });
    await phone.connect({ code: 'DMKT', role: 'phone', team: 2, key: 'phone-1' });
    const seen: ParsedMessage<'phones'>[] = [];
    stage.subscribe('phones', (msg) => seen.push(msg));
    await phone.publish('phones', 'press', { pressId: 'forged', team: 1, at: 1 });
    await phone.publish('phones', 'press', { pressId: 'honest', team: 2, at: 2 });
    await flush();
    expect(seen.map((m) => [m.message.pressId, m.topicTeam])).toEqual([['honest', 2]]);
  });

  it('carries stage messages to phones in other tabs and never echoes them back', async () => {
    const { tabA, tabB } = setup();
    const stage = new MemoryRoomTransport({ hub: tabA });
    const phone = new MemoryRoomTransport({ hub: tabB });
    await stage.connect({ code: 'DMKT', role: 'stage' });
    await phone.connect({ code: 'DMKT', role: 'phone', team: 1 });

    const phoneSaw: string[] = [];
    const stageSaw: string[] = [];
    phone.subscribe('stage', (msg) => phoneSaw.push(msg.event));
    stage.subscribe('stage', (msg) => stageSaw.push(msg.event));
    await stage.publish('stage', 'teams', { teams: [{ id: 1, name: 'Reds', color: '#e23b4a' }] });
    await flush();

    expect(phoneSaw).toEqual(['teams']);
    expect(stageSaw).toEqual([]);
  });

  it('keeps room codes apart and keeps role read rules in the receiving tab', async () => {
    const { tabA, tabB } = setup();
    const stage = new MemoryRoomTransport({ hub: tabA });
    const otherRoom = new MemoryRoomTransport({ hub: tabB });
    const phone = new MemoryRoomTransport({ hub: tabB });
    await stage.connect({ code: 'DMKT', role: 'stage' });
    await otherRoom.connect({ code: 'BBBB', role: 'phone', team: 1 });
    await phone.connect({ code: 'DMKT', role: 'phone', team: 2 });

    const wrongRoom: string[] = [];
    const phoneTopics: string[] = [];
    otherRoom.subscribe('stage', (msg) => wrongRoom.push(msg.event));
    phone.subscribe('stage', (msg) => phoneTopics.push(msg.event));
    await stage.publish('stage', 'controls', {
      activeTeam: null,
      canBuy: false,
      canSpin: false,
      canSolve: false,
      turnName: '',
    });
    await flush();

    expect(wrongRoom).toEqual([]);
    expect(phoneTopics).toEqual(['controls']);
  });

  it('lists phones from other tabs on the stage roster, and drops them when they leave', async () => {
    const { tabA, tabB } = setup();
    const stage = new MemoryRoomTransport({ hub: tabA });
    const rosters: PresenceEntry[][] = [];
    stage.onPresence((roster) => rosters.push(roster));
    await stage.connect({ code: 'DMKT', role: 'stage' });

    const phone = new MemoryRoomTransport({ hub: tabB, ua: 'phone-ua' });
    await phone.connect({ code: 'DMKT', role: 'phone', team: 4, nickname: 'Ada', key: 'u-1' });
    await flush();
    expect(rosters.at(-1)).toEqual([{ key: 'u-1', role: 'phone', team: 4, nickname: 'Ada', ua: 'phone-ua' }]);

    await phone.disconnect();
    await flush();
    expect(rosters.at(-1)).toEqual([]);
  });

  it('shows a tab that was already open to a stage tab that opens later (hello / presence)', async () => {
    const network = new FakeNetwork();
    const tabB = new BroadcastRoomHub({ hubId: 'B', channelFactory: () => network.open() });
    const phone = new MemoryRoomTransport({ hub: tabB, ua: 'ua' });
    await phone.connect({ code: 'DMKT', role: 'phone', team: 2, key: 'u-2' });

    const tabA = new BroadcastRoomHub({ hubId: 'A', channelFactory: () => network.open() });
    const stage = new MemoryRoomTransport({ hub: tabA });
    const rosters: PresenceEntry[][] = [];
    stage.onPresence((roster) => rosters.push(roster));
    await stage.connect({ code: 'DMKT', role: 'stage' });
    await flush();

    expect(rosters.at(-1)?.map((entry) => entry.key)).toEqual(['u-2']);
  });

  it('drops a closed tab from the roster', async () => {
    const { tabA, tabB } = setup();
    const stage = new MemoryRoomTransport({ hub: tabA });
    const rosters: PresenceEntry[][] = [];
    stage.onPresence((roster) => rosters.push(roster));
    await stage.connect({ code: 'DMKT', role: 'stage' });
    const phone = new MemoryRoomTransport({ hub: tabB });
    await phone.connect({ code: 'DMKT', role: 'phone', team: 1, key: 'u-3' });
    await flush();
    expect(rosters.at(-1)).toHaveLength(1);

    tabB.close();
    await flush();
    expect(rosters.at(-1)).toEqual([]);
  });

  it('does not show phones to a phone, and hides host views from rosters that cannot read them', async () => {
    const { tabA, tabB } = setup();
    const phone = new MemoryRoomTransport({ hub: tabA });
    const phoneRosters: PresenceEntry[][] = [];
    phone.onPresence((roster) => phoneRosters.push(roster));
    await phone.connect({ code: 'DMKT', role: 'phone', team: 1, key: 'u-4' });
    const host = new MemoryRoomTransport({ hub: tabB });
    await host.connect({ code: 'DMKT', role: 'host', key: 'h-1' });
    await flush();
    expect(phoneRosters).toEqual([]);

    const hostRosters: PresenceEntry[][] = [];
    host.onPresence((roster) => hostRosters.push(roster));
    await phone.disconnect();
    await phone.connect({ code: 'DMKT', role: 'phone', team: 1, key: 'u-4' });
    await flush();
    // A host view reads only the host topic: it must not see the phone from the other tab.
    expect(hostRosters.every((roster) => roster.every((entry) => entry.role === 'host'))).toBe(true);
  });

  it('allocates presence keys that cannot collide across tabs', () => {
    const { tabA, tabB } = setup();
    expect(tabA.allocateKey()).not.toBe(tabB.allocateKey());
  });

  it('behaves like a plain MemoryRoomHub when BroadcastChannel is unavailable', async () => {
    const hub = new BroadcastRoomHub({ channelFactory: () => null });
    const stage = new MemoryRoomTransport({ hub });
    const phone = new MemoryRoomTransport({ hub });
    await stage.connect({ code: 'DMKT', role: 'stage' });
    await phone.connect({ code: 'DMKT', role: 'phone', team: 1 });
    const seen: string[] = [];
    stage.subscribe('phones', (msg) => seen.push(msg.event));
    await phone.publish('phones', 'press', { pressId: 'x', team: 1, at: 1 });
    await flush();
    expect(seen).toEqual(['press']);
    expect(() => {
      hub.close();
    }).not.toThrow();
  });

  it('ignores junk on the channel', async () => {
    const network = new FakeNetwork();
    const tab = new BroadcastRoomHub({ hubId: 'A', channelFactory: () => network.open() });
    const stage = new MemoryRoomTransport({ hub: tab });
    await stage.connect({ code: 'DMKT', role: 'stage' });
    const noise = network.open();
    for (const junk of [
      null,
      'x',
      { k: 'msg' },
      { k: 'msg', from: 'Z', code: 'DMKT', topic: 'nope', event: 'e' },
    ]) {
      noise.postMessage(junk);
    }
    await flush();
    expect(stage.status).toBe('connected');
  });
});
