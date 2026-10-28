/**
 * Hand-rolled stand-in for the slice of supabase-js that `SupabaseRoomTransport` uses. A
 * `FakeRealtimeBackend` plays the server: several fake clients share it, broadcasts fan out to the
 * other joined channels of the same topic (never back to the sender, like `self: false`), and
 * presence is kept per topic and key. Test-only; nothing in the app imports this file.
 */
import type { BroadcastEnvelope, RealtimeChannelLike, SupabaseLike } from './SupabaseRoomTransport';

/** `PENDING` never answers, like a join that is still in flight. */
export type JoinOutcome = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED' | 'PENDING';

type SubscribeCallback = (status: string, err?: Error) => void;

export class FakeChannel implements RealtimeChannelLike {
  joined = false;
  removed = false;
  readonly sent: { event: string; payload: unknown }[] = [];
  readonly tracked: Record<string, unknown>[] = [];
  private readonly broadcastHandlers = new Map<string, (payload: BroadcastEnvelope) => void>();
  private syncHandler: (() => void) | null = null;
  private statusCallback: SubscribeCallback | null = null;

  constructor(
    readonly backend: FakeRealtimeBackend,
    readonly topic: string,
    readonly options: { config: { private: boolean; presence: { key: string } } },
  ) {}

  get key(): string {
    return this.options.config.presence.key;
  }

  on(type: 'broadcast', filter: { event: string }, callback: (payload: BroadcastEnvelope) => void): unknown;
  on(type: 'presence', filter: { event: 'sync' }, callback: () => void): unknown;
  on(type: string, filter: { event: string }, callback: (payload: BroadcastEnvelope) => void): unknown {
    if (type === 'broadcast') this.broadcastHandlers.set(filter.event, callback);
    else if (type === 'presence') this.syncHandler = callback as () => void;
    return this;
  }

  subscribe(callback?: SubscribeCallback): unknown {
    this.statusCallback = callback ?? null;
    const outcome = this.backend.joinOutcome(this.topic);
    queueMicrotask(() => {
      if (this.removed || outcome === 'PENDING') return;
      if (outcome === 'SUBSCRIBED') {
        this.joined = true;
        this.backend.channels.add(this);
      }
      this.statusCallback?.(outcome, outcome === 'SUBSCRIBED' ? undefined : new Error(`fake ${outcome}`));
    });
    return this;
  }

  send(args: { type: 'broadcast'; event: string; payload: unknown }): Promise<string> {
    if (!this.joined) return Promise.resolve('error');
    this.sent.push({ event: args.event, payload: args.payload });
    this.backend.fanOut(this, args.event, args.payload);
    return Promise.resolve(this.backend.sendResult);
  }

  track(payload: Record<string, unknown>): Promise<string> {
    if (!this.joined) return Promise.resolve('error');
    this.tracked.push(payload);
    this.backend.setPresence(this.topic, this.key, payload);
    return Promise.resolve('ok');
  }

  presenceState(): Record<string, readonly unknown[]> {
    return this.backend.presenceOf(this.topic);
  }

  /** @internal */
  receive(event: string, payload: unknown): void {
    this.broadcastHandlers.get(event)?.({ event, payload });
  }

  /** @internal */
  sync(): void {
    this.syncHandler?.();
  }

  /** Fires the subscribe callback even though the channel was already replaced (a late straggler). */
  straggle(status: string): void {
    this.statusCallback?.(status);
  }

  /** @internal Server-side close: the channel is gone and says so. */
  serverClose(status: JoinOutcome): void {
    if (!this.joined) return;
    this.joined = false;
    this.backend.channels.delete(this);
    this.statusCallback?.(status);
  }
}

export class FakeRealtimeBackend {
  readonly channels = new Set<FakeChannel>();
  readonly clients: FakeSupabaseClient[] = [];
  /** `online = false` makes every new join fail with `offlineOutcome`. */
  online = true;
  offlineOutcome: JoinOutcome = 'TIMED_OUT';
  /** Optional per-topic override, for example to deny one topic like an RLS policy would. */
  joinOverride: ((topic: string) => JoinOutcome | undefined) | null = null;
  sendResult = 'ok';
  private readonly presence = new Map<string, Map<string, Record<string, unknown>>>();

  createClient(): FakeSupabaseClient {
    const client = new FakeSupabaseClient(this);
    this.clients.push(client);
    return client;
  }

  joinOutcome(topic: string): JoinOutcome {
    const override = this.joinOverride?.(topic);
    if (override !== undefined) return override;
    return this.online ? 'SUBSCRIBED' : this.offlineOutcome;
  }

  fanOut(sender: FakeChannel, event: string, payload: unknown): void {
    // Serialise like the real wire so receivers get copies.
    const text = JSON.stringify(payload);
    for (const channel of this.channels) {
      if (channel === sender || channel.topic !== sender.topic) continue;
      queueMicrotask(() => {
        if (channel.joined) channel.receive(event, JSON.parse(text) as unknown);
      });
    }
  }

  setPresence(topic: string, key: string, payload: Record<string, unknown>): void {
    let room = this.presence.get(topic);
    if (room === undefined) {
      room = new Map();
      this.presence.set(topic, room);
    }
    room.set(key, payload);
    this.notifySync(topic);
  }

  removePresence(topic: string, key: string): void {
    if (this.presence.get(topic)?.delete(key) === true) this.notifySync(topic);
  }

  presenceOf(topic: string): Record<string, readonly unknown[]> {
    const state: Record<string, readonly unknown[]> = {};
    for (const [key, payload] of this.presence.get(topic) ?? []) {
      state[key] = [{ presence_ref: `ref-${key}`, ...payload }];
    }
    return state;
  }

  /** Server drops every joined channel (optionally one room only) and refuses rejoins until `restore`. */
  drop(codePrefix = '', status: JoinOutcome = 'CLOSED'): void {
    this.online = false;
    for (const channel of [...this.channels]) {
      if (!channel.topic.startsWith(`room:${codePrefix}`)) continue;
      this.removePresence(channel.topic, channel.key);
      channel.serverClose(status);
    }
  }

  restore(): void {
    this.online = true;
  }

  private notifySync(topic: string): void {
    for (const channel of this.channels) {
      if (channel.topic === topic)
        queueMicrotask(() => {
          channel.sync();
        });
    }
  }
}

export type AuthListener = (event: string, session: { access_token: string } | null) => void;

export class FakeSupabaseClient implements SupabaseLike {
  readonly created: FakeChannel[] = [];
  readonly removed: FakeChannel[] = [];
  readonly authTokens: (string | null | undefined)[] = [];
  authListeners = new Set<AuthListener>();
  setAuthError: Error | null = null;

  constructor(readonly backend: FakeRealtimeBackend) {}

  channel(topic: string, opts: { config: { private: boolean; presence: { key: string } } }): FakeChannel {
    const channel = new FakeChannel(this.backend, topic, opts);
    this.created.push(channel);
    return channel;
  }

  removeChannel(channel: RealtimeChannelLike): Promise<string> {
    if (channel instanceof FakeChannel) {
      this.removed.push(channel);
      channel.removed = true;
      if (channel.joined) {
        channel.joined = false;
        this.backend.channels.delete(channel);
        this.backend.removePresence(channel.topic, channel.key);
      }
    }
    return Promise.resolve('ok');
  }

  readonly realtime = {
    setAuth: (token?: string | null): Promise<void> => {
      this.authTokens.push(token);
      return this.setAuthError === null ? Promise.resolve() : Promise.reject(this.setAuthError);
    },
  };

  readonly auth = {
    onAuthStateChange: (callback: AuthListener) => {
      this.authListeners.add(callback);
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              this.authListeners.delete(callback);
            },
          },
        },
      };
    },
  };

  /** Simulates supabase-js emitting an auth event. */
  emitAuth(event: string, session: { access_token: string } | null): void {
    for (const listener of [...this.authListeners]) listener(event, session);
  }

  /** Channels currently open (created and not removed). */
  get open(): FakeChannel[] {
    return this.created.filter((channel) => !channel.removed);
  }
}
