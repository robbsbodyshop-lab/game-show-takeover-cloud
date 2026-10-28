/**
 * The stage's side of the host protocol (design.md §5, FR-013, FR-017, FR-018).
 *
 * Snapshots go out on the realtime `host` topic and are mirrored on `BroadcastChannel('gst-host')`
 * (same browser, free, works offline). The latest snapshot per kind is kept and re-sent when a host
 * view says `hello` (on the path it came from) and when the transport (re)connects. Commands arrive
 * from either path and are de-duplicated, checked for staleness, routed to the game's handler or to
 * the hub handler, and answered with a `result` on the path they came in on. The stage stays the
 * single authority: nothing here decides a rule (P-004).
 */
import { logger } from '@/lib/logger';
import type { RoomTransport } from '@/realtime';
import {
  COMMAND_REPEAT_WINDOW_MS,
  HOST_BROADCAST_CHANNEL,
  isSnapshotKind,
  type CommandResult,
  type HostBridge,
  type HostCommand,
  type HostCommandInput,
  type HostSnapshot,
  type SnapshotKind,
} from './hostProtocol';
import { openBroadcastLink, type BroadcastLink } from './hostWire';

export interface StageHostChannel {
  bridge: HostBridge;
  /** Publishes the hub snapshot (`kind` is forced to `'hub'`). */
  publishHub(snapshot: HostSnapshot): void;
  /** Handles `target: 'hub'` commands (pause, resume, buzz, show-mode, quit-game, ...). */
  onHubCommand(handler: (cmd: HostCommand) => CommandResult): () => void;
  /**
   * The latest snapshot published for `kind`. Without a kind: the latest non-hub snapshot, or the hub
   * one when no game has published. The same object is returned until a newer one is published, so it
   * is safe to hand to `useSyncExternalStore`.
   */
  getSnapshot(kind?: SnapshotKind): HostSnapshot | null;
  /** Calls `listener` after any snapshot is published or the active kind changes; returns unsubscribe. */
  subscribe(listener: () => void): () => void;
  /**
   * The F2 drawer's way in: the same de-duplication, staleness and handler routing as a received
   * command, run synchronously in this process. Nothing is sent back on any path. A missing `gameRev`
   * is stamped from the latest snapshot for the target, a missing `cmdId` is generated.
   */
  dispatchLocal: (cmd: HostCommandInput | HostCommand) => CommandResult;
  dispose(): void;
}

type CommandHandler = (command: HostCommand) => CommandResult;

/** How long a cmdId is remembered; long enough for both paths and a slow retry. */
const CMD_MEMORY_MS = 60_000;
const CMD_MEMORY_MAX = 500;

/** Undo must still work after the game moved on, so it skips the staleness check. */
const STALE_EXEMPT_NAME = 'undo';

type Path = 'realtime' | 'broadcast';

/** Key order must not matter: {a,b} and {b,a} are the same press. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

let localCounter = 0;
const newLocalCmdId = (): string => {
  localCounter += 1;
  return `local-${String(Date.now())}-${String(localCounter)}`;
};

const signatureOf = (c: HostCommand): string =>
  stableStringify([c.target, c.name, c.args ?? null, c.teamId ?? null]);

export function createStageHostChannel(opts: {
  transport: RoomTransport;
  broadcastChannelName?: string;
}): StageHostChannel {
  const { transport } = opts;
  const link: BroadcastLink | null = openBroadcastLink(opts.broadcastChannelName ?? HOST_BROADCAST_CHANNEL);

  const latest = new Map<SnapshotKind, HostSnapshot>();
  const handlers = new Map<SnapshotKind, Set<CommandHandler>>();
  const seenCmdIds = new Map<string, { at: number; result: CommandResult }>();
  const recentSignatures = new Map<string, number>();
  const listeners = new Set<() => void>();
  /** Kind of the most recent non-hub snapshot; what `getSnapshot()` without a kind prefers. */
  let activeKind: SnapshotKind | null = null;
  let disposed = false;

  const notify = (): void => {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (error) {
        logger.error('[host] snapshot listener threw', error);
      }
    }
  };

  // --- outbound -------------------------------------------------------------------------------

  const sendRealtime = (snapshot: HostSnapshot): void => {
    if (transport.status !== 'connected') return;
    transport
      .publish('host', 'snapshot', {
        kind: snapshot.kind,
        gameRev: snapshot.gameRev,
        inputLocked: snapshot.inputLocked,
        data: snapshot.data,
      })
      .catch((error: unknown) => {
        logger.warn('[host] snapshot publish failed', error);
      });
  };

  const sendBroadcast = (snapshot: HostSnapshot): void => {
    link?.post({
      t: 'snapshot',
      sent: Date.now(),
      snapshot: {
        kind: snapshot.kind,
        gameRev: snapshot.gameRev,
        inputLocked: snapshot.inputLocked,
        data: snapshot.data,
      },
    });
  };

  const resendAll = (path: Path | 'both'): void => {
    for (const snapshot of latest.values()) {
      if (path !== 'broadcast') sendRealtime(snapshot);
      if (path !== 'realtime') sendBroadcast(snapshot);
    }
  };

  const reply = (path: Path, cmdId: string, result: CommandResult): void => {
    const reason = result.applied ? undefined : result.reason.slice(0, 200);
    if (path === 'broadcast') {
      link?.post({
        t: 'result',
        cmdId,
        applied: result.applied,
        ...(reason === undefined ? {} : { reason }),
      });
      return;
    }
    if (transport.status !== 'connected') return;
    transport
      .publish('host', 'result', {
        cmdId,
        applied: result.applied,
        ...(reason === undefined ? {} : { reason }),
      })
      .catch((error: unknown) => {
        logger.warn('[host] result publish failed', error);
      });
  };

  const publishSnapshot = (snapshot: HostSnapshot): void => {
    if (disposed) return;
    latest.set(snapshot.kind, snapshot);
    if (snapshot.kind !== 'hub') activeKind = snapshot.kind;
    sendRealtime(snapshot);
    sendBroadcast(snapshot);
    notify();
  };

  const getSnapshot = (kind?: SnapshotKind): HostSnapshot | null => {
    if (kind !== undefined) return latest.get(kind) ?? null;
    const active = activeKind === null ? undefined : latest.get(activeKind);
    return active ?? latest.get('hub') ?? null;
  };

  // --- inbound commands -----------------------------------------------------------------------

  const prune = (now: number): void => {
    for (const [id, entry] of seenCmdIds) {
      if (now - entry.at > CMD_MEMORY_MS) seenCmdIds.delete(id);
    }
    while (seenCmdIds.size > CMD_MEMORY_MAX) {
      const oldest = seenCmdIds.keys().next();
      if (oldest.done) break;
      seenCmdIds.delete(oldest.value);
    }
    for (const [signature, at] of recentSignatures) {
      if (now - at >= COMMAND_REPEAT_WINDOW_MS) recentSignatures.delete(signature);
    }
  };

  const route = (command: HostCommand): CommandResult => {
    const set = handlers.get(command.target);
    if (set === undefined || set.size === 0) return { applied: false, reason: 'no-handler' };
    let first: CommandResult | null = null;
    for (const handler of [...set]) {
      let result: CommandResult;
      try {
        result = handler(command);
      } catch (error) {
        logger.error('[host] command handler threw', command.name, error);
        result = { applied: false, reason: 'error' };
      }
      if (result.applied) return result;
      first ??= result;
    }
    return first ?? { applied: false, reason: 'no-handler' };
  };

  const decide = (command: HostCommand): CommandResult => {
    const snapshot = latest.get(command.target);
    if (
      command.target !== 'hub' &&
      command.name !== STALE_EXEMPT_NAME &&
      snapshot !== undefined &&
      command.gameRev < snapshot.gameRev
    ) {
      return { applied: false, reason: 'stale' };
    }
    const signature = signatureOf(command);
    const last = recentSignatures.get(signature);
    const now = Date.now();
    if (last !== undefined && now - last < COMMAND_REPEAT_WINDOW_MS) {
      return { applied: false, reason: 'duplicate' };
    }
    recentSignatures.set(signature, now);
    return route(command);
  };

  /** De-duplicates by cmdId, then decides. Shared by the network paths and `dispatchLocal`. */
  const processCommand = (command: HostCommand): CommandResult => {
    const now = Date.now();
    prune(now);
    const known = seenCmdIds.get(command.cmdId);
    // Same command via the second path (or a retry): answer again, never apply twice.
    if (known !== undefined) return known.result;
    const result = decide(command);
    seenCmdIds.set(command.cmdId, { at: now, result });
    return result;
  };

  const handleCommand = (command: HostCommand, path: Path): void => {
    if (disposed) return;
    reply(path, command.cmdId, processCommand(command));
  };

  const dispatchLocal = (input: HostCommandInput | HostCommand): CommandResult => {
    if (disposed) return { applied: false, reason: 'disposed' };
    const { cmdId, gameRev, ...rest } = input;
    return processCommand({
      ...rest,
      cmdId: cmdId ?? newLocalCmdId(),
      gameRev: gameRev ?? latest.get(input.target)?.gameRev ?? 0,
    });
  };

  // --- wiring ---------------------------------------------------------------------------------

  const unsubscribers: (() => void)[] = [];

  unsubscribers.push(
    transport.subscribe('host', (parsed) => {
      if (parsed.event === 'hello') {
        resendAll('realtime');
        return;
      }
      if (parsed.event !== 'command') return;
      const m = parsed.message;
      if (!isSnapshotKind(m.target)) {
        reply('realtime', m.cmdId, { applied: false, reason: 'unknown-target' });
        return;
      }
      handleCommand(
        {
          cmdId: m.cmdId,
          target: m.target,
          gameRev: m.gameRev,
          name: m.name,
          ...(m.teamId === undefined ? {} : { teamId: m.teamId }),
          ...(m.args === undefined ? {} : { args: m.args }),
        },
        'realtime',
      );
    }),
  );

  unsubscribers.push(
    transport.onStatus((status) => {
      if (status === 'connected') resendAll('realtime');
    }),
  );

  if (link !== null) {
    unsubscribers.push(
      link.listen((message) => {
        if (message.t === 'hello') resendAll('broadcast');
        else if (message.t === 'command') handleCommand(message.command, 'broadcast');
      }),
    );
  }

  const onCommand: HostBridge['onCommand'] = (target, handler) => {
    let set = handlers.get(target);
    if (set === undefined) {
      set = new Set();
      handlers.set(target, set);
    }
    set.add(handler);
    return () => {
      handlers.get(target)?.delete(handler);
    };
  };

  return {
    bridge: { publishSnapshot, onCommand },
    publishHub: (snapshot) => {
      publishSnapshot({ ...snapshot, kind: 'hub' });
    },
    onHubCommand: (handler) => onCommand('hub', handler),
    getSnapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatchLocal,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const unsubscribe of unsubscribers) unsubscribe();
      link?.close();
      latest.clear();
      activeKind = null;
      listeners.clear();
      handlers.clear();
      seenCmdIds.clear();
      recentSignatures.clear();
    },
  };
}
