/**
 * Everything the stage keeps outside React: the room (opened through the data layer), the stage
 * transport, the phone bridge and the host channel. A framework-free controller exposed through
 * `useSyncExternalStore` (conventions.md), so it is testable with the in-memory hub.
 *
 *  - `start()` is synchronous for the bridges (so a game can mount at once and keyboard buzzes work
 *    even when the network is down, P-001) and asynchronous for the room: open, connect, retry.
 *  - `teams` are re-published on every `connected` status and whenever they change (design.md §5).
 *  - `touchRoom` keeps the room alive every 5 minutes (FR-028).
 *  - The director lease (design.md TD-002, `directorLease.ts`) gates the room: `start()` builds the local
 *    bridges at once but opens the room and connects the transport only after this tab holds the lease.
 *    A refused or lost lease tears the bridges and transport down (`lease: 'readonly'`); the stage
 *    never connects as `stage` while another stage is the director.
 *  - `stop()` is idempotent and `start()` can run again (React StrictMode mounts effects twice).
 */
import type { DataLayer, TeamSummary } from '@/data';
import { logger } from '@/lib/logger';
import type { AudienceMessage, ConnectionStatus, PresenceEntry, Role, RoomTransport } from '@/realtime';
import { DirectorLease, getTabSessionId, type LeaseStatus } from './directorLease';
import type { StageHostChannel } from './hostChannelAdapter';
import { createPhoneBridge, type StagePhoneBridge } from './phoneBridge';

export const TOUCH_ROOM_INTERVAL_MS = 5 * 60 * 1000;
/** Phones treat 8 s of silence as a lost stage; the audience message doubles as the heartbeat. */
export const AUDIENCE_HEARTBEAT_MS = 3000;
export const OPEN_ROOM_RETRY_MS = 10_000;

export type AudiencePayload = Omit<AudienceMessage, 'v' | 'from' | 'sent'>;

export interface RuntimeSnapshot {
  /** True once the bridges exist (synchronously after `start`). */
  ready: boolean;
  code: string | null;
  status: ConnectionStatus;
  /** Every presence entry; phones are `role: 'phone'`, host views `role: 'host'`. */
  roster: PresenceEntry[];
  error: string | null;
  /** `readonly`: another stage is the director (design.md TD-002); nothing is connected. */
  lease: LeaseStatus;
  phones: StagePhoneBridge | null;
  channel: StageHostChannel | null;
}

export interface StageRuntimeDeps {
  eventId: string;
  userId: string;
  data: DataLayer;
  createTransport: (role: Role) => RoomTransport;
  createHostChannel: (opts: { transport: RoomTransport }) => StageHostChannel;
  /** The teams as phones see them at the start; `setTeams` keeps them current. */
  teams: readonly TeamSummary[];
  /** This tab's lease identity; defaults to the per-tab id in sessionStorage. */
  sessionId?: string;
  /** Lease renewal period (default 10 s) and lifetime (default 30 s, server side). */
  heartbeatMs?: number;
  leaseTtlSeconds?: number;
  touchIntervalMs?: number;
  /** Audience heartbeat period (tests shorten it). */
  audienceHeartbeatMs?: number;
  retryMs?: number;
}

const EMPTY: RuntimeSnapshot = {
  ready: false,
  code: null,
  status: 'offline',
  roster: [],
  error: null,
  lease: 'claiming',
  phones: null,
  channel: null,
};

export class StageRuntime {
  private snap: RuntimeSnapshot = EMPTY;
  private readonly listeners = new Set<() => void>();
  private generation = 0;
  private transport: RoomTransport | null = null;
  private lease: DirectorLease | null = null;
  private cleanups: (() => void)[] = [];
  private touchTimer: ReturnType<typeof setInterval> | null = null;
  private audienceTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private teamsSignature: string | null = null;
  private teams: readonly TeamSummary[];
  private knownPhones = new Set<string>();
  private latestAudience: AudiencePayload | null = null;
  private audienceSignature: string | null = null;

  constructor(private readonly deps: StageRuntimeDeps) {
    this.teams = deps.teams;
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): RuntimeSnapshot => this.snap;

  start(): void {
    if (this.lease !== null) return;
    const generation = ++this.generation;
    const transport = this.deps.createTransport('stage');
    this.transport = transport;
    const phones = createPhoneBridge({
      transport,
      getTeamIds: () => this.teams.map((t) => t.id),
    });
    const channel = this.deps.createHostChannel({ transport });
    this.cleanups.push(
      () => {
        phones.dispose();
      },
      () => {
        channel.dispose();
      },
      transport.onStatus((status) => {
        this.set({ status });
        if (status === 'connected') this.onConnected(phones);
      }),
      transport.onPresence((roster) => {
        this.set({ roster });
        this.welcomeNewPhones(roster, phones);
      }),
    );
    this.set({ ready: true, phones, channel, status: transport.status, error: null, lease: 'claiming' });
    const lease = new DirectorLease({
      events: this.deps.data.events,
      eventId: this.deps.eventId,
      sessionId: this.deps.sessionId ?? getTabSessionId(),
      ...(this.deps.heartbeatMs === undefined ? {} : { heartbeatMs: this.deps.heartbeatMs }),
      ...(this.deps.leaseTtlSeconds === undefined ? {} : { ttlSeconds: this.deps.leaseTtlSeconds }),
      onChange: (status) => {
        this.onLease(generation, transport, status);
      },
    });
    this.lease = lease;
    lease.start();
  }

  stop(): void {
    if (this.lease === null) return;
    this.lease.stop();
    this.lease = null;
    this.teardown();
    this.snap = EMPTY;
    this.emit();
  }

  /** A save conflict proved another stage is the director: go read-only and give the lease back. */
  demote(): void {
    this.lease?.demote();
  }

  private teardown(): void {
    this.generation += 1;
    const transport = this.transport;
    this.transport = null;
    if (this.touchTimer !== null) clearInterval(this.touchTimer);
    if (this.audienceTimer !== null) clearInterval(this.audienceTimer);
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.touchTimer = null;
    this.audienceTimer = null;
    this.retryTimer = null;
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.teamsSignature = null;
    this.audienceSignature = null;
    this.knownPhones = new Set();
    transport?.disconnect().catch((error: unknown) => {
      logger.warn('[stage] disconnect failed', error);
    });
  }

  /** Stores the current teams and publishes them to the phones if they changed since the last publish. */
  setTeams(teams: readonly TeamSummary[]): void {
    this.teams = teams;
    this.publishTeams(false);
  }

  /** Publishes the small audience state (design.md §5) when it changed; re-sent on reconnect. */
  publishAudience(payload: AudiencePayload): void {
    this.latestAudience = payload;
    this.sendAudience(false);
  }

  // --- internals -----------------------------------------------------------------------------

  private onLease(generation: number, transport: RoomTransport, status: LeaseStatus): void {
    if (generation !== this.generation) return;
    if (status === 'director') {
      this.set({ lease: 'director' });
      void this.connect(generation, transport);
    } else if (status === 'readonly') {
      this.teardown();
      this.snap = { ...EMPTY, lease: 'readonly' };
      this.emit();
    }
  }

  private async connect(generation: number, transport: RoomTransport): Promise<void> {
    try {
      const code = await this.deps.data.rooms.openRoom(this.deps.eventId);
      if (generation !== this.generation) return;
      this.set({ code });
      this.touchTimer ??= setInterval(() => {
        this.deps.data.rooms.touchRoom(code).catch((error: unknown) => {
          logger.warn('[stage] touchRoom failed', error);
        });
      }, this.deps.touchIntervalMs ?? TOUCH_ROOM_INTERVAL_MS);
      await transport.connect({ code, role: 'stage', key: this.deps.userId });
      if (generation !== this.generation) return;
      this.audienceTimer ??= setInterval(() => {
        this.sendAudience(true);
      }, this.deps.audienceHeartbeatMs ?? AUDIENCE_HEARTBEAT_MS);
    } catch (error) {
      if (generation !== this.generation) return;
      const message = error instanceof Error ? error.message : 'Phones are unavailable';
      logger.warn('[stage] room unavailable, retrying', error);
      this.set({ error: message });
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        if (generation === this.generation) void this.connect(generation, transport);
      }, this.deps.retryMs ?? OPEN_ROOM_RETRY_MS);
    }
  }

  private onConnected(phones: StagePhoneBridge): void {
    this.set({ error: null });
    this.publishTeams(true);
    this.sendAudience(true);
    phones.republish();
  }

  /** A phone that joined after the stage connected missed everything: send it the current state (design.md §5). */
  private welcomeNewPhones(roster: readonly PresenceEntry[], phones: StagePhoneBridge): void {
    const keys = new Set(roster.filter((entry) => entry.role === 'phone').map((entry) => entry.key));
    const fresh = [...keys].some((key) => !this.knownPhones.has(key));
    this.knownPhones = keys;
    if (fresh && this.transport?.status === 'connected') this.onConnected(phones);
  }

  private publishTeams(force: boolean): void {
    const transport = this.transport;
    if (transport?.status !== 'connected') return;
    const teams = this.teams.map(({ id, name, color }) => ({ id, name, color }));
    const signature = JSON.stringify(teams);
    if (!force && signature === this.teamsSignature) return;
    this.teamsSignature = signature;
    transport.publish('stage', 'teams', { teams }).catch((error: unknown) => {
      this.teamsSignature = null;
      logger.warn('[stage] teams publish failed', error);
    });
  }

  private sendAudience(force: boolean): void {
    const transport = this.transport;
    const payload = this.latestAudience;
    if (transport?.status !== 'connected' || payload === null) return;
    const signature = JSON.stringify(payload);
    if (!force && signature === this.audienceSignature) return;
    this.audienceSignature = signature;
    transport.publish('stage', 'audience', payload).catch((error: unknown) => {
      this.audienceSignature = null;
      logger.warn('[stage] audience publish failed', error);
    });
  }

  private set(patch: Partial<RuntimeSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    this.emit();
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
