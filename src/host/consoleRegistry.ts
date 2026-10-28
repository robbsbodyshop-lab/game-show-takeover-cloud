/**
 * Where game modules plug their console into the host panel. The Feud and Wheel modules call
 * `registerHostConsole('feud', FeudConsole)` once; both the F2 drawer and the host view then render it
 * through `HostConsoleFor`. A console gets the snapshot it was registered for and a `send` that either
 * goes over the network (host view) or straight into the stage (drawer).
 */
import { createElement, type ComponentType, type ReactElement } from 'react';
import { HubConsole } from './HubConsole';
import type { HostSend, HostSnapshot, SnapshotKind } from './hostProtocol';

export interface HostConsoleProps {
  snapshot: HostSnapshot;
  send: HostSend;
}

export type HostConsoleComponent = ComponentType<HostConsoleProps>;

const consoles = new Map<SnapshotKind, HostConsoleComponent>([['hub', HubConsole]]);
const listeners = new Set<() => void>();
let version = 0;

const notify = (): void => {
  version += 1;
  for (const listener of [...listeners]) listener();
};

/** Registers (or replaces) the console for a kind; returns a function that removes it again. */
export function registerHostConsole(kind: SnapshotKind, component: HostConsoleComponent): () => void {
  consoles.set(kind, component);
  notify();
  return () => {
    if (consoles.get(kind) === component) {
      consoles.delete(kind);
      notify();
    }
  };
}

/** The registered console for `snapshot.kind`-style lookups, rendered; null when none is registered. */
export function renderHostConsole(kind: SnapshotKind, props: HostConsoleProps): ReactElement | null {
  const component = consoles.get(kind);
  return component === undefined ? null : createElement(component, props);
}

/** For `useSyncExternalStore`: re-render when a console is registered after first paint. */
export const subscribeHostConsoles = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const hostConsoleVersion = (): number => version;
