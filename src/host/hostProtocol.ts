/**
 * Host view protocol on top of the realtime `host` topic (design.md §5) and the same-browser
 * `BroadcastChannel('gst-host')` mirror. Snapshots carry hidden information and only ever go to
 * the host topic; the audience never sees them (P-002).
 */

export type SnapshotKind = 'hub' | 'feud' | 'wheel' | 'puzzle' | 'speed' | 'plinko';

export interface HostSnapshot<TData = unknown> {
  kind: SnapshotKind;
  /** The game's revision; commands stamped with an older one are dropped (FR-017). */
  gameRev: number;
  inputLocked: boolean;
  data: TData;
}

export interface HostCommand {
  cmdId: string;
  target: SnapshotKind;
  gameRev: number;
  teamId?: number;
  name: string;
  args?: Record<string, unknown>;
}

export type CommandResult = { applied: true } | { applied: false; reason: string };

/** The stage's side: a game publishes snapshots and answers commands addressed to its kind. */
export interface HostBridge {
  publishSnapshot(snapshot: HostSnapshot): void;
  /** Register the handler for commands whose `target` is this kind; returns unsubscribe. */
  onCommand(target: SnapshotKind, handler: (command: HostCommand) => CommandResult): () => void;
}

/** Hub-level commands handled by the stage itself, not by a game. */
export const HUB_COMMANDS = [
  'pause',
  'resume',
  'buzz',
  'show-mode',
  'quit-game',
  'reset-scores',
  /** Sent by the host view after it saved settings: the stage re-reads them from the account. */
  'settings-changed',
] as const;
export type HubCommandName = (typeof HUB_COMMANDS)[number];

export const HOST_HELLO_INTERVAL_MS = 2000;
export const HOST_LOST_CONTACT_MS = 6000;
export const COMMAND_REPEAT_WINDOW_MS = 500;
export const HOST_BROADCAST_CHANNEL = 'gst-host';

// ---------------------------------------------------------------------------------------------
// Additions from T11 (additive only; the contract above is unchanged).

export const SNAPSHOT_KINDS = [
  'hub',
  'feud',
  'wheel',
  'puzzle',
  'speed',
  'plinko',
] as const satisfies readonly SnapshotKind[];

export function isSnapshotKind(value: unknown): value is SnapshotKind {
  return typeof value === 'string' && (SNAPSHOT_KINDS as readonly string[]).includes(value);
}

/**
 * What a console passes to `HostSend`. The host client fills in `cmdId` and, when `gameRev` is
 * missing, stamps the revision of the latest snapshot it holds for `target` (FR-017).
 */
export type HostCommandInput = Omit<HostCommand, 'cmdId' | 'gameRev'> & {
  cmdId?: string;
  gameRev?: number;
};

/**
 * How a console sends a command: over the network from the host view (always asynchronous) or
 * straight into the stage's dispatcher from the F2 drawer (may answer synchronously).
 */
export type HostSend = (command: HostCommandInput) => CommandResult | Promise<CommandResult>;
