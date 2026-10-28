/**
 * Demo-mode hub that reaches across browser tabs of the same origin (design.md §16:
 * `/play?demo=1&room=DMKT` opened in another tab joins a demo stage).
 *
 * It is a `MemoryRoomHub` that also relays through `BroadcastChannel('gst-room-hub')`:
 *  - every message a local client publishes is posted to the other tabs, whose hubs deliver it to
 *    their own clients with the same read rules (so a phone tab still cannot read the phones topic);
 *  - each hub announces the presence entries of its local clients, and `rosterFor` merges the
 *    entries announced by other tabs, so a stage in tab A lists the phones of tabs B and C;
 *  - a new hub says `hello` and the others answer with their presence; a closing tab says `bye`.
 *
 * Limits: no heartbeat, so a tab that crashes without `pagehide` leaves its presence entries behind
 * until the room is reloaded. Without `BroadcastChannel` the hub behaves exactly like `MemoryRoomHub`.
 */
import {
  MemoryRoomHub,
  type MemoryRoomTransport,
  type SimulateDisconnectOptions,
} from './MemoryRoomTransport';
import { PRESENCE_READ_TOPICS } from './roles';
import { isTeamId, isTopicKind, type TopicKind } from './roomCodes';
import { sortRoster, type PresenceEntry } from './RoomTransport';
import { parsePresencePayload } from './schemas';

export const BROADCAST_CHANNEL_NAME = 'gst-room-hub';

/** The slice of `BroadcastChannel` the hub uses; tests pass a fake. */
export interface RelayChannel {
  postMessage(data: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  close(): void;
}

export interface BroadcastHubOptions {
  /** Defaults to `gst-room-hub`. */
  channelName?: string;
  /** Builds the channel; defaults to the platform `BroadcastChannel`, or none when unavailable. */
  channelFactory?: (name: string) => RelayChannel | null;
  /** Identifies this hub to the others (tests pass a fixed id); defaults to a random one. */
  hubId?: string;
}

type RelayMessage =
  | {
      k: 'msg';
      from: string;
      code: string;
      topic: TopicKind;
      event: string;
      wire: unknown;
      /** Team of the phones topic the message was published on; absent for other topics. */
      team?: number;
    }
  | { k: 'presence'; from: string; code: string; entries: PresenceEntry[] }
  | { k: 'hello'; from: string }
  | { k: 'bye'; from: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseEntries = (raw: unknown): PresenceEntry[] => {
  if (!Array.isArray(raw)) return [];
  const entries: PresenceEntry[] = [];
  for (const item of raw as unknown[]) {
    if (!isRecord(item)) continue;
    const payload = parsePresencePayload(item);
    const { key, role } = item;
    if (payload === null || typeof key !== 'string' || (role !== 'phone' && role !== 'host')) continue;
    entries.push({ key, role, ...payload });
  }
  return entries;
};

/** Validates what came off the channel; anything else (another app on the channel) is ignored. */
const parseRelay = (data: unknown): RelayMessage | null => {
  if (!isRecord(data) || typeof data.from !== 'string') return null;
  const from = data.from;
  switch (data.k) {
    case 'hello':
    case 'bye':
      return { k: data.k, from };
    case 'presence':
      return typeof data.code === 'string'
        ? { k: 'presence', from, code: data.code, entries: parseEntries(data.entries) }
        : null;
    case 'msg':
      if (typeof data.code !== 'string' || !isTopicKind(data.topic) || typeof data.event !== 'string')
        return null;
      return {
        k: 'msg',
        from,
        code: data.code,
        topic: data.topic,
        event: data.event,
        wire: data.wire,
        ...(isTeamId(data.team) ? { team: data.team } : {}),
      };
    default:
      return null;
  }
};

const defaultChannelFactory = (name: string): RelayChannel | null =>
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(name);

export class BroadcastRoomHub extends MemoryRoomHub {
  readonly hubId: string;
  private readonly channel: RelayChannel | null;
  /** Presence entries announced by other hubs: hub id -> room code -> entries. */
  private readonly remote = new Map<string, Map<string, PresenceEntry[]>>();

  constructor(options: BroadcastHubOptions = {}) {
    super();
    this.hubId = options.hubId ?? `hub-${Math.random().toString(36).slice(2, 10)}`;
    const factory = options.channelFactory ?? defaultChannelFactory;
    this.channel = factory(options.channelName ?? BROADCAST_CHANNEL_NAME);
    this.channel?.addEventListener('message', this.onRelay);
    if (typeof window !== 'undefined') window.addEventListener('pagehide', this.onPageHide);
    this.post({ k: 'hello', from: this.hubId });
  }

  /** Tells the other tabs this hub is gone and stops listening. Safe to call twice. */
  close(): void {
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this.onPageHide);
    if (this.channel === null) return;
    this.post({ k: 'bye', from: this.hubId });
    this.channel.removeEventListener('message', this.onRelay);
    this.channel.close();
  }

  /** Keys must be unique across tabs, because rosters from all tabs are merged. */
  override allocateKey(): string {
    return `${this.hubId}:${super.allocateKey()}`;
  }

  override deliver(
    code: string,
    topic: TopicKind,
    event: string,
    wire: unknown,
    sender: MemoryRoomTransport | null,
    topicTeam?: number,
  ): void {
    super.deliver(code, topic, event, wire, sender, topicTeam);
    // `sender === null` means the message came from another tab: never echo it back.
    if (sender !== null) {
      this.post({
        k: 'msg',
        from: this.hubId,
        code,
        topic,
        event,
        wire,
        ...(topicTeam === undefined ? {} : { team: topicTeam }),
      });
    }
  }

  override rosterFor(code: string, reader: MemoryRoomTransport): PresenceEntry[] | null {
    const local = super.rosterFor(code, reader);
    if (local === null) return null;
    const visible = PRESENCE_READ_TOPICS[reader.role];
    const seen = new Set(local.map((entry) => entry.key));
    const merged = [...local];
    for (const byCode of this.remote.values()) {
      for (const entry of byCode.get(code) ?? []) {
        if (seen.has(entry.key) || !visible.includes(entry.role === 'host' ? 'host' : 'phones')) continue;
        seen.add(entry.key);
        merged.push(entry);
      }
    }
    return sortRoster(merged);
  }

  override presenceChanged(code: string): void {
    super.presenceChanged(code);
    this.announcePresence(code);
  }

  override simulateDisconnect(code: string, options: SimulateDisconnectOptions = {}): void {
    super.simulateDisconnect(code, options);
    // Dropped clients stop being "live", so the other tabs must hear that they left.
    this.announcePresence(code);
  }

  // --- relay -----------------------------------------------------------------------------------

  private readonly onPageHide = (): void => {
    this.close();
  };

  private post(message: RelayMessage): void {
    this.channel?.postMessage(message);
  }

  private localEntries(code: string): PresenceEntry[] {
    const entries: PresenceEntry[] = [];
    for (const client of this.rooms.get(code) ?? []) {
      const entry = client.presenceEntry();
      if (entry !== null) entries.push(entry);
    }
    return entries;
  }

  private announcePresence(code: string): void {
    this.post({ k: 'presence', from: this.hubId, code, entries: this.localEntries(code) });
  }

  private deliverFromRelay(
    code: string,
    topic: TopicKind,
    event: string,
    wire: unknown,
    team: number | undefined,
  ): void {
    super.deliver(code, topic, event, wire, null, team);
  }

  /** Wakes the rosters of this tab's own clients without announcing anything. */
  private refreshLocalRosters(code: string): void {
    super.presenceChanged(code);
  }

  private readonly onRelay = (event: { data: unknown }): void => {
    const message = parseRelay(event.data);
    if (message === null || message.from === this.hubId) return;
    switch (message.k) {
      case 'msg':
        this.deliverFromRelay(message.code, message.topic, message.event, message.wire, message.team);
        return;
      case 'presence': {
        let byCode = this.remote.get(message.from);
        if (byCode === undefined) {
          byCode = new Map();
          this.remote.set(message.from, byCode);
        }
        if (message.entries.length === 0) byCode.delete(message.code);
        else byCode.set(message.code, message.entries);
        this.refreshLocalRosters(message.code);
        return;
      }
      case 'hello':
        for (const code of this.rooms.keys()) this.announcePresence(code);
        return;
      case 'bye': {
        const gone = this.remote.get(message.from);
        this.remote.delete(message.from);
        for (const code of gone?.keys() ?? []) this.refreshLocalRosters(code);
        return;
      }
    }
  };
}
