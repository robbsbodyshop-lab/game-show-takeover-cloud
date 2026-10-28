/**
 * The host view's side of the host protocol (design.md §5, §13). Listens for snapshots on the realtime
 * `host` topic and on the same-browser `BroadcastChannel`, says `hello` every 2 s, tracks whether the
 * stage is still talking ("looking" -> "live" -> "lost" after 6 s of silence) and sends commands over
 * both paths, resolving with the stage's `result` (or a timeout after 3 s).
 *
 * The state object is replaced, never mutated, so `subscribe` + `getState` plug straight into
 * `useSyncExternalStore`.
 */
import { logger } from '@/lib/logger';
import type { RoomTransport } from '@/realtime';
import {
  HOST_BROADCAST_CHANNEL,
  HOST_HELLO_INTERVAL_MS,
  HOST_LOST_CONTACT_MS,
  isSnapshotKind,
  type CommandResult,
  type HostCommand,
  type HostCommandInput,
  type HostSnapshot,
  type SnapshotKind,
} from './hostProtocol';
import { readHubData } from './hubSnapshot';
import { openBroadcastLink, type BroadcastLink } from './hostWire';

export type HostConnectionState = 'looking' | 'live' | 'lost';

export const HOST_SEND_TIMEOUT_MS = 3000;

export interface HostClientState {
  /** Latest snapshot per kind. */
  snapshots: Readonly<Partial<Record<SnapshotKind, HostSnapshot>>>;
  /** When each kind's snapshot arrived (client clock). */
  receivedAt: Readonly<Partial<Record<SnapshotKind, number>>>;
  connectionState: HostConnectionState;
}

export interface HostClient {
  readonly snapshots: HostClientState['snapshots'];
  readonly connectionState: HostConnectionState;
  getState: () => HostClientState;
  /** Sends a command on every available path and resolves with the stage's answer. Never rejects. */
  send: (command: HostCommandInput) => Promise<CommandResult>;
  subscribe: (listener: () => void) => () => void;
  dispose: () => void;
}

export interface HostClientOptions {
  transport?: RoomTransport;
  broadcastChannelName?: string;
  hostId: string;
}

/**
 * Which kind's console to show: the hub's `activeGame` when the stage names one, otherwise the most
 * recently received game snapshot, otherwise the hub.
 */
export function currentSnapshotKind(state: HostClientState): SnapshotKind | null {
  const hub = state.snapshots.hub;
  if (hub !== undefined && hubDeclaresActiveGame(hub.data)) {
    const active = readHubData(hub.data).activeGame;
    return active !== null && state.snapshots[active] !== undefined ? active : 'hub';
  }
  let best: SnapshotKind | null = null;
  let bestAt = -1;
  for (const [kind, at] of Object.entries(state.receivedAt)) {
    if (!isSnapshotKind(kind) || kind === 'hub') continue;
    if (at > bestAt) {
      best = kind;
      bestAt = at;
    }
  }
  if (best !== null) return best;
  return hub === undefined ? null : 'hub';
}

const hubDeclaresActiveGame = (data: unknown): boolean =>
  typeof data === 'object' && data !== null && 'activeGame' in data;

let counter = 0;
const newCmdId = (hostId: string): string => {
  counter += 1;
  return `${hostId.slice(0, 8)}-${Date.now().toString(36)}-${counter.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`.slice(0, 64);
};

export function createHostClient(opts: HostClientOptions): HostClient {
  const { transport, hostId } = opts;
  const link: BroadcastLink | null = openBroadcastLink(opts.broadcastChannelName ?? HOST_BROADCAST_CHANNEL);

  let state: HostClientState = { snapshots: {}, receivedAt: {}, connectionState: 'looking' };
  const listeners = new Set<() => void>();
  const pending = new Map<
    string,
    { resolve: (result: CommandResult) => void; timer: ReturnType<typeof setTimeout> }
  >();
  const lastSent: Partial<Record<SnapshotKind, number>> = {};
  let lostTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const setState = (next: HostClientState): void => {
    state = next;
    for (const listener of [...listeners]) listener();
  };

  const markLost = (): void => {
    lostTimer = null;
    if (state.connectionState === 'live') setState({ ...state, connectionState: 'lost' });
  };

  /** Anything from the stage proves it is alive and restarts the 6 s silence timer. */
  const heard = (): void => {
    if (lostTimer !== null) clearTimeout(lostTimer);
    lostTimer = setTimeout(markLost, HOST_LOST_CONTACT_MS);
  };

  const accept = (snapshot: HostSnapshot, sent: number | null): void => {
    heard();
    const previousSent = lastSent[snapshot.kind];
    if (sent !== null && previousSent !== undefined && sent < previousSent) {
      // A late copy from the slower path: still proof of life, but not newer than what we hold.
      if (state.connectionState !== 'live') setState({ ...state, connectionState: 'live' });
      return;
    }
    if (sent !== null) lastSent[snapshot.kind] = sent;
    setState({
      snapshots: { ...state.snapshots, [snapshot.kind]: snapshot },
      receivedAt: { ...state.receivedAt, [snapshot.kind]: Date.now() },
      connectionState: 'live',
    });
  };

  const settle = (cmdId: string, result: CommandResult): void => {
    const entry = pending.get(cmdId);
    if (entry === undefined) return;
    pending.delete(cmdId);
    clearTimeout(entry.timer);
    entry.resolve(result);
  };

  const settleFromWire = (cmdId: string, applied: boolean, reason: string | undefined): void => {
    heard();
    settle(cmdId, applied ? { applied: true } : { applied: false, reason: reason ?? 'rejected' });
  };

  const unsubscribers: (() => void)[] = [];

  if (transport !== undefined) {
    unsubscribers.push(
      transport.subscribe('host', (parsed) => {
        if (parsed.event === 'snapshot') {
          const m = parsed.message;
          if (!isSnapshotKind(m.kind)) return;
          accept({ kind: m.kind, gameRev: m.gameRev, inputLocked: m.inputLocked, data: m.data }, m.sent);
        } else if (parsed.event === 'result') {
          settleFromWire(parsed.message.cmdId, parsed.message.applied, parsed.message.reason);
        }
      }),
    );
  }

  if (link !== null) {
    unsubscribers.push(
      link.listen((message) => {
        if (message.t === 'snapshot') accept(message.snapshot, message.sent);
        else if (message.t === 'result') settleFromWire(message.cmdId, message.applied, message.reason);
      }),
    );
  }

  const sendHello = (): void => {
    if (transport?.status === 'connected') {
      transport.publish('host', 'hello', { hostId }).catch((error: unknown) => {
        logger.warn('[host] hello failed', error);
      });
    }
    link?.post({ t: 'hello', hostId });
  };

  sendHello();
  const helloTimer = setInterval(sendHello, HOST_HELLO_INTERVAL_MS);

  // A reconnect is the best moment to ask again instead of waiting up to 2 s.
  if (transport !== undefined) {
    unsubscribers.push(
      transport.onStatus((status) => {
        if (status === 'connected') sendHello();
      }),
    );
  }

  const send = (input: HostCommandInput): Promise<CommandResult> => {
    if (disposed) return Promise.resolve({ applied: false, reason: 'disposed' });
    const cmdId = input.cmdId ?? newCmdId(hostId);
    const command: HostCommand = {
      cmdId,
      target: input.target,
      gameRev: input.gameRev ?? state.snapshots[input.target]?.gameRev ?? 0,
      name: input.name,
      ...(input.teamId === undefined ? {} : { teamId: input.teamId }),
      ...(input.args === undefined ? {} : { args: input.args }),
    };
    return new Promise<CommandResult>((resolve) => {
      const timer = setTimeout(() => {
        settle(cmdId, { applied: false, reason: 'timeout' });
      }, HOST_SEND_TIMEOUT_MS);
      pending.set(cmdId, { resolve, timer });
      if (transport?.status === 'connected') {
        transport
          .publish('host', 'command', {
            cmdId,
            target: command.target,
            gameRev: command.gameRev,
            name: command.name,
            ...(command.teamId === undefined ? {} : { teamId: command.teamId }),
            ...(command.args === undefined ? {} : { args: command.args }),
          })
          .catch((error: unknown) => {
            logger.warn('[host] command publish failed', error);
          });
      }
      link?.post({ t: 'command', command });
    });
  };

  return {
    get snapshots() {
      return state.snapshots;
    },
    get connectionState() {
      return state.connectionState;
    },
    getState: () => state,
    send,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      clearInterval(helloTimer);
      if (lostTimer !== null) clearTimeout(lostTimer);
      for (const unsubscribe of unsubscribers) unsubscribe();
      link?.close();
      for (const cmdId of [...pending.keys()]) settle(cmdId, { applied: false, reason: 'disposed' });
      listeners.clear();
    },
  };
}
