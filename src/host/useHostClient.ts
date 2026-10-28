import { useSyncExternalStore } from 'react';
import type { HostClient, HostClientState } from './hostClient';

/** The client's state for React; re-renders on every snapshot and connection change. */
export function useHostClientState(client: HostClient): HostClientState {
  return useSyncExternalStore(client.subscribe, client.getState);
}
