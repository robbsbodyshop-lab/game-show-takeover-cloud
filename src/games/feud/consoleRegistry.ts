/**
 * Adapter between the Feud console's `sendCommand(name, args, options)` style and the host panel's
 * registry (`src/host/consoleRegistry.ts`), whose consoles receive `{ snapshot, send }`. The game's
 * console keeps the friendlier signature; registration wraps it.
 */
import { createElement, type ComponentType } from 'react';
import { registerHostConsole as registerWithHost } from '@/host/consoleRegistry';
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

const adapters = new Map<SnapshotKind, HostConsoleComponent>();

export const registerHostConsole = (kind: SnapshotKind, component: HostConsoleComponent): void => {
  adapters.set(kind, component);
  registerWithHost(kind, ({ snapshot, send }) =>
    createElement(component, {
      snapshot,
      sendCommand: (name, args, options) => {
        void send({
          target: kind,
          name,
          args,
          teamId: options?.teamId,
          gameRev: options?.gameRev ?? snapshot.gameRev,
        });
      },
    }),
  );
};

export const getHostConsole = (kind: SnapshotKind): HostConsoleComponent | undefined => adapters.get(kind);
