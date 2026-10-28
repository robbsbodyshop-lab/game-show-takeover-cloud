import { useCallback, useSyncExternalStore } from 'react';
import { readHubData } from '@/host/hubSnapshot';
import type { HostSnapshot } from '@/host/hostProtocol';
import type { StageHostChannel } from './hostChannelAdapter';

const subscribeNothing = (): (() => void) => () => undefined;
const noSnapshot = (): null => null;

/**
 * The snapshot the F2 drawer should show: the console of the game the stage names in its hub snapshot
 * (`activeGame`), the hub snapshot at the hub or while that game has not published yet, null before the
 * stage published anything (or without a channel). Read in-process from the channel: no network.
 */
export function useHostDrawerSnapshot(channel: StageHostChannel | null): HostSnapshot | null {
  const subscribe = useCallback(
    (listener: () => void) => (channel ? channel.subscribe(listener) : subscribeNothing()),
    [channel],
  );
  const getSnapshot = useCallback((): HostSnapshot | null => {
    if (!channel) return noSnapshot();
    const hub = channel.getSnapshot('hub');
    const active = hub === null ? null : readHubData(hub.data).activeGame;
    return (active === null ? null : channel.getSnapshot(active)) ?? hub;
  }, [channel]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
