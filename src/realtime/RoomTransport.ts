/**
 * The seam between the game and the network (design.md §5, §6). `games/` never import this; the
 * stage, host view and phone app receive a `RoomTransport` from a provider, so the same code runs
 * on Supabase Realtime or on the in-memory hub used by tests, demo mode and Playwright.
 */
import type { TopicKind } from './roomCodes';
import type { EventNameFor, ParsedMessage, PayloadFor, PresencePayload, Role } from './schemas';

export type { TopicKind } from './roomCodes';
export type { EventNameFor, ParsedMessage, PayloadFor, Role } from './schemas';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'error';

export interface ConnectOptions {
  /** Room code (4 consonants for the Supabase transport). */
  code: string;
  role: Role;
  /** 1..8, required for `role: 'phone'`. */
  team?: number;
  nickname?: string;
  /**
   * Presence key; defaults to a random id. Reuse the same key (for example the auth user id) after
   * a reload so the old presence entry is replaced instead of lingering as a ghost.
   */
  key?: string;
}

/** One connected client on the roster (phones from the phones topic, host views from the host topic). */
export interface PresenceEntry extends PresencePayload {
  key: string;
  role: 'phone' | 'host';
}

/** Internal, untyped view of a parsed message used by transports to store handlers per topic. */
export interface AnyParsedMessage {
  topic: TopicKind;
  event: string;
  message: unknown;
}

export type StatusHandler = (status: ConnectionStatus, detail?: string) => void;

export interface RoomTransport {
  readonly status: ConnectionStatus;

  /**
   * Resolves once every channel for the role is joined. Rejects (status `error`) if that first
   * attempt fails, for example because the room does not exist or the token is rejected; a drop
   * after that is retried automatically (status `reconnecting`).
   */
  connect(opts: ConnectOptions): Promise<void>;
  disconnect(): Promise<void>;

  /**
   * Sends one message; the transport adds the envelope `{ v, from, sent }`. A publish the role may
   * not make, or an invalid or oversized payload, is dropped locally with a logged warning and the
   * promise still resolves (a UI bug must not stall the show). It rejects only when delivery was
   * attempted and failed. Publishing while not connected is dropped with a warning.
   */
  publish<K extends TopicKind, E extends EventNameFor<K>>(
    topic: K,
    event: E,
    payload: PayloadFor<K, E>,
  ): Promise<void>;

  /** Receives validated messages from other clients (never this client's own). */
  subscribe<K extends TopicKind>(topic: K, handler: (msg: ParsedMessage<K>) => void): () => void;

  /**
   * Full roster on every change. The stage sees phones and host views, a host view sees host views,
   * a phone sees nothing (it cannot read the phones topic).
   */
  onPresence(handler: (roster: PresenceEntry[]) => void): () => void;
  onStatus(handler: StatusHandler): () => void;
}

/** Stable roster order: hosts first, then by team, nickname, key. */
export function sortRoster(roster: PresenceEntry[]): PresenceEntry[] {
  const rank = (e: PresenceEntry): number => (e.role === 'host' ? 0 : 1);
  return [...roster].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.team - b.team ||
      a.nickname.localeCompare(b.nickname) ||
      a.key.localeCompare(b.key),
  );
}

/** Validates connect options shared by both transports; returns an error message or null. */
export function validateConnectOptions(
  opts: ConnectOptions,
  codeOk: (code: string) => boolean,
): string | null {
  if (!codeOk(opts.code)) return `invalid room code ${JSON.stringify(opts.code)}`;
  if (opts.role === 'phone') {
    if (!Number.isInteger(opts.team) || (opts.team ?? 0) < 1 || (opts.team ?? 0) > 8) {
      return 'a phone must connect with a team from 1 to 8';
    }
  }
  return null;
}
