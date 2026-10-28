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
  let disposed = false;

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
    sendRealtime(snapshot);
    sendBroadcast(snapshot);
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

  const handleCommand = (command: HostCommand, path: Path): void => {
    if (disposed) return;
    const now = Date.now();
    prune(now);
    const known = seenCmdIds.get(command.cmdId);
    if (known !== undefined) {
      // Same command via the second path (or a retry): answer again, never apply twice.
      reply(path, command.cmdId, known.result);
      return;
    }
    const result = decide(command);
    seenCmdIds.set(command.cmdId, { at: now, result });
    reply(path, command.cmdId, result);
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
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const unsubscribe of unsubscribers) unsubscribe();
      link?.close();
      latest.clear();
      handlers.clear();
      seenCmdIds.clear();
      recentSignatures.clear();
    },
  };
}
