import { useSyncExternalStore } from 'react';
import { hostConsoleVersion, renderHostConsole, subscribeHostConsoles } from './consoleRegistry';
import type { HostSend, HostSnapshot, SnapshotKind } from './hostProtocol';

export interface HostConsoleForProps {
  kind: SnapshotKind;
  snapshot: HostSnapshot | null;
  send: HostSend;
}

/** Renders the console registered for `kind`, or a plain notice while there is nothing to show. */
export const HostConsoleFor = ({ kind, snapshot, send }: HostConsoleForProps) => {
  // The version number changes whenever a console registers, so a late registration still renders.
  useSyncExternalStore(subscribeHostConsoles, hostConsoleVersion);
  if (snapshot === null) return <p role="status">Waiting for the stage…</p>;
  return (
    renderHostConsole(kind, { snapshot, send }) ?? <p role="status">No host console for “{kind}” yet.</p>
  );
};
