/**
 * In-process transport for unit tests, demo mode (`--mode demo`) and Playwright. Many
 * `MemoryRoomTransport` instances connect to one `MemoryRoomHub` by room code and see the same
 * rules as the Supabase transport: role guard, topic read access, no echo to the sender, presence
 * for phones and host views, schema validation on receipt, and asynchronous (microtask) delivery.
 */
import { logger } from '../lib/logger';
import { HandlerSet } from './handlerSet';
import { isTopicCode, topicFor, type TopicKind } from './roomCodes';
import { PRESENCE_READ_TOPICS, PRESENCE_TRACK_TOPIC, canRead, prepareOutgoing } from './roles';
import {
  sortRoster,
  validateConnectOptions,
  type AnyParsedMessage,
  type ConnectOptions,
  type ConnectionStatus,
  type PresenceEntry,
  type RoomTransport,
  type StatusHandler,
} from './RoomTransport';
import {
  MAX_NICKNAME_LENGTH,
  parseMessage,
  type EventNameFor,
  type ParsedMessage,
  type PayloadFor,
  type PresencePayload,
  type Role,
} from './schemas';

export interface SimulateDisconnectOptions {
  /** Reconnect automatically after this many milliseconds; omit to call `simulateReconnect` yourself. */
  reconnectAfterMs?: number;
}

export class MemoryRoomHub {
  private readonly rooms = new Map<string, Set<MemoryRoomTransport>>();
  private nextId = 1;

  /** Unique presence key for a transport created without one. */
  allocateKey(): string {
    return `mem-${String(this.nextId++)}`;
  }

  /** @internal */
  attach(code: string, client: MemoryRoomTransport): void {
    let room = this.rooms.get(code);
    if (room === undefined) {
      room = new Set();
      this.rooms.set(code, room);
    }
    room.add(client);
  }

  /** @internal */
  detach(code: string, client: MemoryRoomTransport): void {
    const room = this.rooms.get(code);
    if (room === undefined) return;
    room.delete(client);
    if (room.size === 0) this.rooms.delete(code);
  }

  /** Number of transports (connected or not) attached to a room. */
  clientCount(code: string): number {
    return this.rooms.get(code)?.size ?? 0;
  }

  /** @internal Delivers one wire message to every other client that can read the topic. */
  deliver(code: string, topic: TopicKind, event: string, wire: unknown, sender: MemoryRoomTransport): void {
    // Round-trip through JSON so receivers never share object identity with the sender.
    const text = JSON.stringify(wire);
    for (const client of this.rooms.get(code) ?? []) {
      if (client === sender || !client.isLive || !canRead(client.role, topic)) continue;
      queueMicrotask(() => {
        client.receive(topic, event, JSON.parse(text) as unknown);
      });
    }
  }

  /** @internal The roster `reader` is allowed to see, or `null` if its role never sees presence. */
  rosterFor(code: string, reader: MemoryRoomTransport): PresenceEntry[] | null {
    const visible = PRESENCE_READ_TOPICS[reader.role];
    if (visible.length === 0) return null;
    const roster: PresenceEntry[] = [];
    for (const client of this.rooms.get(code) ?? []) {
      const entry = client.presenceEntry();
      const topic = PRESENCE_TRACK_TOPIC[client.role];
      if (entry !== null && topic !== null && visible.includes(topic)) roster.push(entry);
    }
    return sortRoster(roster);
  }

  /** @internal Tells every presence reader in the room that the roster may have changed. */
  presenceChanged(code: string): void {
    for (const client of this.rooms.get(code) ?? []) client.scheduleRoster();
  }

  /**
   * Drops every live connection in the room: clients go to `reconnecting`, vanish from the roster
   * and miss everything sent meanwhile. Pair with `simulateReconnect` (or `reconnectAfterMs`).
   */
  simulateDisconnect(code: string, options: SimulateDisconnectOptions = {}): void {
    const room = this.rooms.get(code);
    if (room === undefined) return;
    for (const client of room) client.drop('simulated disconnect');
    if (options.reconnectAfterMs !== undefined) {
      setTimeout(() => {
        this.simulateReconnect(code);
      }, options.reconnectAfterMs);
    }
  }

  /** Brings every dropped client in the room back to `connected` and republishes presence. */
  simulateReconnect(code: string): void {
    const room = this.rooms.get(code);
    if (room === undefined) return;
    for (const client of room) client.restore();
    this.presenceChanged(code);
  }
}

export interface MemoryTransportDeps {
  hub: MemoryRoomHub;
  /** User agent reported in presence; defaults to `navigator.userAgent` when available. */
  ua?: string;
  now?: () => number;
}

export class MemoryRoomTransport implements RoomTransport {
  private readonly hub: MemoryRoomHub;
  private readonly ua: string;
  private readonly now: () => number;

  private currentStatus: ConnectionStatus = 'offline';
  private code: string | null = null;
  private currentRole: Role = 'stage';
  private key = '';
  private presence: PresencePayload | null = null;
  private rosterQueued = false;

  private readonly messageHandlers: Record<TopicKind, HandlerSet<[AnyParsedMessage]>> = {
    stage: new HandlerSet(),
    phones: new HandlerSet(),
    host: new HandlerSet(),
  };
  private readonly presenceHandlers = new HandlerSet<[PresenceEntry[]]>();
  private readonly statusHandlers = new HandlerSet<[ConnectionStatus, string | undefined]>();

  constructor(deps: MemoryTransportDeps) {
    this.hub = deps.hub;
    this.now = deps.now ?? Date.now;
    this.ua = deps.ua ?? (typeof navigator === 'undefined' ? 'memory' : navigator.userAgent);
  }

  get status(): ConnectionStatus {
    return this.currentStatus;
  }

  get role(): Role {
    return this.currentRole;
  }

  /** @internal Receives and sends only while the (simulated) socket is up. */
  get isLive(): boolean {
    return this.currentStatus === 'connected';
  }

  async connect(opts: ConnectOptions): Promise<void> {
    if (this.code !== null) await this.disconnect();
    const problem = validateConnectOptions(opts, isTopicCode);
    if (problem !== null) {
      this.setStatus('error', problem);
      throw new Error(`MemoryRoomTransport.connect: ${problem}`);
    }
    this.setStatus('connecting');
    await Promise.resolve();
    this.code = opts.code;
    this.currentRole = opts.role;
    this.key = opts.key ?? this.hub.allocateKey();
    this.presence = this.buildPresence(opts);
    this.hub.attach(opts.code, this);
    this.setStatus('connected');
    this.hub.presenceChanged(opts.code);
  }

  async disconnect(): Promise<void> {
    const code = this.code;
    if (code !== null) {
      this.code = null;
      this.hub.detach(code, this);
      this.presence = null;
      this.hub.presenceChanged(code);
    }
    if (this.currentStatus !== 'offline') this.setStatus('offline');
    await Promise.resolve();
  }

  async publish<K extends TopicKind, E extends EventNameFor<K>>(
    topic: K,
    event: E,
    payload: PayloadFor<K, E>,
  ): Promise<void> {
    const out = prepareOutgoing(this.currentRole, topic, event, payload, this.now());
    if (!out.ok) return;
    if (this.code === null || !this.isLive) {
      logger.warn(`[realtime] dropped "${event}" on topic ${topic}: not connected (${this.currentStatus})`);
      return;
    }
    this.hub.deliver(this.code, topic, event, out.wire, this);
    await Promise.resolve();
  }

  subscribe<K extends TopicKind>(topic: K, handler: (msg: ParsedMessage<K>) => void): () => void {
    if (!canRead(this.currentRole, topic) && this.code !== null) {
      logger.warn(`[realtime] ${this.currentRole} cannot read topic ${topicFor(this.code, topic)}`);
      return () => undefined;
    }
    // Handlers are stored untyped per topic; `topic` ties each one to its own message union.
    return this.messageHandlers[topic].add(handler as unknown as (msg: AnyParsedMessage) => void);
  }

  onPresence(handler: (roster: PresenceEntry[]) => void): () => void {
    return this.presenceHandlers.add(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    return this.statusHandlers.add(handler);
  }

  // --- hub callbacks -------------------------------------------------------------------------

  /** @internal */
  receive(topic: TopicKind, event: string, raw: unknown): void {
    if (!this.isLive) return;
    const parsed = parseMessage(topic, event, raw);
    if (parsed === null) return;
    this.messageHandlers[topic].emit(parsed);
  }

  /** @internal */
  presenceEntry(): PresenceEntry | null {
    if (!this.isLive || this.presence === null || PRESENCE_TRACK_TOPIC[this.currentRole] === null)
      return null;
    const role = this.currentRole === 'host' ? 'host' : 'phone';
    return { key: this.key, role, ...this.presence };
  }

  /** @internal Coalesces roster updates within one microtask turn. */
  scheduleRoster(): void {
    if (this.rosterQueued || this.code === null || PRESENCE_READ_TOPICS[this.currentRole].length === 0)
      return;
    this.rosterQueued = true;
    queueMicrotask(() => {
      this.rosterQueued = false;
      if (this.code === null || !this.isLive) return;
      const roster = this.hub.rosterFor(this.code, this);
      if (roster !== null) this.presenceHandlers.emit(roster);
    });
  }

  /** @internal */
  drop(detail: string): void {
    if (this.currentStatus === 'connected') this.setStatus('reconnecting', detail);
  }

  /** @internal */
  restore(): void {
    if (this.currentStatus === 'reconnecting') this.setStatus('connected');
  }

  private buildPresence(opts: ConnectOptions): PresencePayload | null {
    if (PRESENCE_TRACK_TOPIC[opts.role] === null) return null;
    const nickname = (opts.nickname ?? (opts.role === 'host' ? 'Host' : '')).slice(0, MAX_NICKNAME_LENGTH);
    return { team: opts.role === 'host' ? 0 : (opts.team ?? 0), nickname, ua: this.ua.slice(0, 200) };
  }

  private setStatus(status: ConnectionStatus, detail?: string): void {
    this.currentStatus = status;
    this.statusHandlers.emit(status, detail);
  }
}
