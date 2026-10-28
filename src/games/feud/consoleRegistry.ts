/**
 * The minimal host-console registry the Feud console registers with. The host panel (src/host) owns the
 * real one; until its module exists this local copy keeps the console self-contained. The interface is
 * the same shape: `registerHostConsole(kind, component)` and a lookup the F2 drawer and /host use.
 */
import type { ComponentType } from 'react';
import type { HostSnapshot, SnapshotKind } from '@/host/hostProtocol';

export interface CommandOptions {
  /** The acting team, so a ruling for a turn that has passed is dropped (FR-017). */
  teamId?: number;
  /** Overrides the revision stamp (a two-tap confirmation carries the revision of its first tap). */
  gameRev?: number;
}

/** What a game's console receives: its latest snapshot and a way to send stamped commands. */
export interface HostConsoleProps {
  snapshot: HostSnapshot;
  sendCommand: (name: string, args?: Record<string, unknown>, options?: CommandOptions) => void;
}

export type HostConsoleComponent = ComponentType<HostConsoleProps>;

const consoles = new Map<SnapshotKind, HostConsoleComponent>();

export const registerHostConsole = (kind: SnapshotKind, component: HostConsoleComponent): void => {
  consoles.set(kind, component);
};

export const getHostConsole = (kind: SnapshotKind): HostConsoleComponent | undefined => consoles.get(kind);
