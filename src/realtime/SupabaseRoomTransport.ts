/**
 * RoomTransport over Supabase Realtime private channels (design.md §4, §5, TD-001).
 *
 * One channel per topic the role needs; messages are Broadcast events, the roster is Presence on
 * the phones topics (phones) and the host topic (host views). Phones topics are per team
 * (`room:<CODE>:phones:<TEAM>`): a phone joins only its own, the stage joins all eight and merges
 * their presence into one roster, so RLS can pin each phone to its team (FR-025, P-004). The client is injected and typed
 * structurally (`SupabaseLike`) so unit tests pass a fake while the real `SupabaseClient` satisfies
 * the same shape (checked at compile time in the test file).
 *
 * Reconnect strategy: when any channel of a connected client errors, times out or closes, the whole
 * set is removed and rebuilt after 1 s, 2 s, 4 s, 8 s, then every 10 s. Rebuilding (rather than
 * trusting each channel's internal rejoin) keeps channel state, presence tracking and the
 * `connected` status consistent. The first connect attempt is not retried; it rejects instead so a
 * wrong code or a policy denial surfaces to the join screen.
 */
import { logger } from '../lib/logger';
import { HandlerSet } from './handlerSet';
import { isRoomCode, topicFor, type TopicKind } from './roomCodes';
import {
  PRESENCE_READ_TOPICS,
  PRESENCE_TRACK_TOPIC,
  canRead,
  channelPlan,
  prepareOutgoing,
  type ChannelSpec,
} from './roles';
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
  EVENTS_BY_TOPIC,
  MAX_NICKNAME_LENGTH,
  parseMessage,
  parsePhonesMessage,
  parsePresencePayload,
  type EventNameFor,
  type ParsedMessage,
  type PayloadFor,
  type PresencePayload,
  type Role,
} from './schemas';

// --- structural slice of supabase-js / realtime-js (verified against 2.118.0 type definitions) ---

export interface BroadcastEnvelope {
  event: string;
  payload?: unknown;
}

export interface RealtimeChannelLike {
  on(type: 'broadcast', filter: { event: string }, callback: (payload: BroadcastEnvelope) => void): unknown;
  on(type: 'presence', filter: { event: 'sync' }, callback: () => void): unknown;
  subscribe(callback?: (status: string, err?: Error) => void, timeout?: number): unknown;
  send(args: { type: 'broadcast'; event: string; payload: unknown }): Promise<string>;
  track(payload: Record<string, unknown>): Promise<string>;
  presenceState(): Record<string, readonly unknown[]>;
}

export interface SupabaseLike {
  channel(
    topic: string,
    opts: { config: { private: boolean; presence: { key: string } } },
  ): RealtimeChannelLike;
  removeChannel(channel: RealtimeChannelLike): Promise<unknown>;
  realtime: { setAuth(token?: string | null): Promise<void> };
  auth: {
    onAuthStateChange(callback: (event: string, session: { access_token: string } | null) => void): {
      data: { subscription: { unsubscribe(): void } };
    };
  };
}

export const RECONNECT_BASE_MS = 1_000;
export const RECONNECT_MAX_MS = 10_000;

/** 1 s, 2 s, 4 s, 8 s, then 10 s for every later attempt. `attempt` starts at 0. */
export function backoffDelay(attempt: number): number {
  return Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.max(0, attempt));
}

export interface SupabaseTransportDeps {
  client: SupabaseLike;
  ua?: string;
  now?: () => number;
  /** Presence key when `connect` does not pass one. */
  randomKey?: () => string;
}

interface ActiveConnection {
  code: string;
  role: Role;
  key: string;
  /** Own team for a phone; selects the phones channel it joins and publishes on. */
  team: number | undefined;
  presence: PresencePayload | null;
}

/** One open channel and what it is for. */
interface OpenChannel {
  spec: ChannelSpec;
  channel: RealtimeChannelLike;
}

export class SupabaseRoomTransport implements RoomTransport {
  private readonly client: SupabaseLike;
  private readonly ua: string;
  private readonly now: () => number;
  private readonly randomKey: () => string;

  private currentStatus: ConnectionStatus = 'offline';
  private active: ActiveConnection | null = null;
  /** Bumped whenever the channel set is replaced; callbacks from older generations are ignored. */
  private epoch = 0;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pending: { resolve: () => void; reject: (error: Error) => void } | null = null;
  private authSubscription: { unsubscribe(): void } | null = null;
  /** Keyed by full topic name, for example `room:BKDX:phones:3`. */
  private channels = new Map<string, OpenChannel>();
  private readonly joined = new Set<string>();

  private readonly messageHandlers: Record<TopicKind, HandlerSet<[AnyParsedMessage]>> = {
    stage: new HandlerSet(),
    phones: new HandlerSet(),
    host: new HandlerSet(),
  };
  private readonly presenceHandlers = new HandlerSet<[PresenceEntry[]]>();
  private readonly statusHandlers = new HandlerSet<[ConnectionStatus, string | undefined]>();

  constructor(deps: SupabaseTransportDeps) {
    this.client = deps.client;
    this.now = deps.now ?? Date.now;
    this.ua = deps.ua ?? (typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent);
    this.randomKey = deps.randomKey ?? (() => crypto.randomUUID());
  }

  get status(): ConnectionStatus {
    return this.currentStatus;
  }

  async connect(opts: ConnectOptions): Promise<void> {
    if (this.active !== null || this.currentStatus !== 'offline') await this.disconnect();
    const problem = validateConnectOptions(opts, isRoomCode);
    if (problem !== null) {
      this.setStatus('error', problem);
      throw new Error(`SupabaseRoomTransport.connect: ${problem}`);
    }
    this.active = {
      code: opts.code,
      role: opts.role,
      key: opts.key ?? this.randomKey(),
      team: opts.role === 'phone' ? opts.team : undefined,
      presence: this.buildPresence(opts),
    };
    this.attempt = 0;
    this.setStatus('connecting');
    this.watchAuth();
    await new Promise<void>((resolve, reject) => {
      this.pending = { resolve, reject };
      this.openChannels();
    });
  }

  async disconnect(): Promise<void> {
    this.epoch++;
    this.clearReconnectTimer();
    this.unwatchAuth();
    this.active = null;
    const pending = this.pending;
    this.pending = null;
    pending?.reject(new Error('SupabaseRoomTransport: disconnected while connecting'));
    await this.closeChannels();
    if (this.currentStatus !== 'offline') this.setStatus('offline');
  }

  async publish<K extends TopicKind, E extends EventNameFor<K>>(
    topic: K,
    event: E,
    payload: PayloadFor<K, E>,
  ): Promise<void> {
    const active = this.active;
    const out = prepareOutgoing(active?.role ?? 'stage', topic, event, payload, this.now());
    if (!out.ok) return;
    const channel =
      active === null
        ? undefined
        : this.channels.get(topicFor(active.code, topic, topic === 'phones' ? active.team : undefined))
            ?.channel;
    if (active === null || channel === undefined || this.currentStatus !== 'connected') {
      logger.warn(`[realtime] dropped "${event}" on topic ${topic}: not connected (${this.currentStatus})`);
      return;
    }
    const result = await channel.send({ type: 'broadcast', event, payload: out.wire });
    if (result !== 'ok') throw new Error(`SupabaseRoomTransport: sending "${event}" failed (${result})`);
  }

  subscribe<K extends TopicKind>(topic: K, handler: (msg: ParsedMessage<K>) => void): () => void {
    if (this.active !== null && !canRead(this.active.role, topic)) {
      logger.warn(`[realtime] ${this.active.role} cannot read topic room:${this.active.code}:${topic}`);
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

  // --- channel lifecycle ---------------------------------------------------------------------

  private openChannels(): void {
    const active = this.active;
    if (active === null) return;
    const epoch = ++this.epoch;
    this.joined.clear();
    try {
      for (const spec of channelPlan(active.role, active.team)) {
        const { kind } = spec;
        const name = topicFor(active.code, kind, spec.team);
        const channel = this.client.channel(name, {
          config: { private: true, presence: { key: active.key } },
        });
        this.channels.set(name, { spec, channel });
        if (canRead(active.role, kind)) {
          for (const event of EVENTS_BY_TOPIC[kind]) {
            channel.on('broadcast', { event }, (message) => {
              this.onBroadcast(epoch, spec, event, message.payload);
            });
          }
        }
        if (PRESENCE_READ_TOPICS[active.role].includes(kind)) {
          channel.on('presence', { event: 'sync' }, () => {
            this.onPresenceSync(epoch);
          });
        }
        channel.subscribe((status, error) => {
          this.onSubscribeStatus(epoch, name, status, error);
        });
      }
    } catch (error) {
      this.fail(epoch, error instanceof Error ? error.message : 'channel setup failed');
    }
  }

  private onSubscribeStatus(epoch: number, name: string, status: string, error?: Error): void {
    if (epoch !== this.epoch || this.active === null) return;
    switch (status) {
      case 'SUBSCRIBED': {
        this.joined.add(name);
        this.trackPresence(epoch, name);
        if (this.joined.size === channelPlan(this.active.role, this.active.team).length)
          this.onFullyConnected();
        return;
      }
      case 'CHANNEL_ERROR':
      case 'TIMED_OUT':
      case 'CLOSED':
        this.fail(epoch, error?.message ?? `${status} on ${name}`);
        return;
      default:
        logger.debug(`[realtime] ignoring subscribe status ${status} on ${name}`);
    }
  }

  private onFullyConnected(): void {
    this.attempt = 0;
    this.setStatus('connected');
    const pending = this.pending;
    this.pending = null;
    pending?.resolve();
  }

  private fail(epoch: number, detail: string): void {
    if (epoch !== this.epoch || this.active === null) return;
    this.epoch++;
    void this.closeChannels();
    const pending = this.pending;
    if (pending !== null) {
      // First attempt: report instead of retrying forever (wrong code, denied by RLS, no network).
      this.pending = null;
      this.active = null;
      this.unwatchAuth();
      this.setStatus('error', detail);
      pending.reject(new Error(`SupabaseRoomTransport: could not connect (${detail})`));
      return;
    }
    this.setStatus('reconnecting', detail);
    const delay = backoffDelay(this.attempt++);
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openChannels();
    }, delay);
  }

  private async closeChannels(): Promise<void> {
    const channels = [...this.channels.values()].map((open) => open.channel);
    this.channels = new Map();
    this.joined.clear();
    await Promise.allSettled(channels.map((channel) => this.client.removeChannel(channel)));
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  // --- inbound -------------------------------------------------------------------------------

  private onBroadcast(epoch: number, spec: ChannelSpec, event: string, raw: unknown): void {
    if (epoch !== this.epoch) return;
    if (spec.kind === 'phones') {
      // The channel, not the payload, says which team spoke; a payload claiming another is dropped.
      const stamped = spec.team === undefined ? null : parsePhonesMessage(event, raw, spec.team);
      if (stamped !== null) this.messageHandlers.phones.emit(stamped);
      return;
    }
    const parsed = parseMessage(spec.kind, event, raw);
    if (parsed === null) return;
    this.messageHandlers[spec.kind].emit(parsed);
  }

  private trackPresence(epoch: number, name: string): void {
    const active = this.active;
    const open = this.channels.get(name);
    if (active?.presence == null || PRESENCE_TRACK_TOPIC[active.role] !== open?.spec.kind) return;
    const { channel } = open;
    channel.track({ ...active.presence }).then(
      (result) => {
        if (result !== 'ok' && epoch === this.epoch)
          logger.warn(`[realtime] presence track returned ${result}`);
      },
      (error: unknown) => {
        logger.warn('[realtime] presence track failed', error);
      },
    );
  }

  private onPresenceSync(epoch: number): void {
    const active = this.active;
    if (epoch !== this.epoch || active === null) return;
    const roster: PresenceEntry[] = [];
    for (const { spec, channel } of this.channels.values()) {
      if (!PRESENCE_READ_TOPICS[active.role].includes(spec.kind)) continue;
      // The stage reads eight phones topics; the merged roster is one list, keyed by presence key.
      const state = channel.presenceState();
      for (const [key, metas] of Object.entries(state)) {
        const payload = parsePresencePayload(metas.at(-1));
        if (payload === null) {
          logger.warn(`[realtime] ignored invalid presence payload for ${key}`);
          continue;
        }
        roster.push({ key, role: spec.kind === 'host' ? 'host' : 'phone', ...payload });
      }
    }
    this.presenceHandlers.emit(sortRoster(roster));
  }

  // --- auth ----------------------------------------------------------------------------------

  /** Keeps Realtime authorised across JWT refreshes (hosts stay on for hours). */
  private watchAuth(): void {
    this.unwatchAuth();
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      if (session === null || (event !== 'TOKEN_REFRESHED' && event !== 'SIGNED_IN')) return;
      this.client.realtime.setAuth(session.access_token).catch((error: unknown) => {
        logger.warn('[realtime] setAuth failed', error);
      });
    });
    this.authSubscription = data.subscription;
  }

  private unwatchAuth(): void {
    this.authSubscription?.unsubscribe();
    this.authSubscription = null;
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
