import { useEffect, useRef } from 'react';
import { HOST_HELLO_INTERVAL_MS } from '@/host/hostProtocol';
import type { StageHostChannel } from './hostChannelAdapter';
import { handleHubCommand, type HubCommandContext } from './hubCommands';
import { buildHubData, type HubDataInput, type StageHubData } from './hubSnapshotData';

/** At least every 2 s even when nothing changed, so a host view that joined late catches up. */
export const HUB_REPUBLISH_MS = HOST_HELLO_INTERVAL_MS;

export interface UseHubChannelOptions {
  channel: StageHostChannel | null;
  data: HubDataInput;
  inputLocked: boolean;
  commands: Omit<HubCommandContext, 'phase' | 'paused' | 'showMode' | 'locked'>;
}

/** Publishes the hub snapshot on change and every 2 s, and answers hub commands. */
export function useHubChannel({ channel, data, inputLocked, commands }: UseHubChannelOptions): void {
  const hub = buildHubData(data);
  // A string compares by value, so the publish effect re-runs only when the snapshot really changed.
  const signature = JSON.stringify(hub);
  const revRef = useRef(0);
  const latest = useRef({ hub, inputLocked, commands, phase: data.session.phase });

  useEffect(() => {
    latest.current = { hub, inputLocked, commands, phase: data.session.phase };
  });

  useEffect(() => {
    if (!channel) return;
    revRef.current += 1;
    const publish = (): void => {
      const current = latest.current;
      const snapshot: StageHubData = {
        ...current.hub,
        gameVisible: document.visibilityState !== 'hidden',
      };
      channel.publishHub({
        kind: 'hub',
        gameRev: revRef.current,
        inputLocked: current.inputLocked,
        data: snapshot,
      });
    };
    publish();
    const timer = setInterval(publish, HUB_REPUBLISH_MS);
    document.addEventListener('visibilitychange', publish);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', publish);
    };
  }, [channel, signature, inputLocked]);

  useEffect(() => {
    if (!channel) return;
    return channel.onHubCommand((command) => {
      const current = latest.current;
      return handleHubCommand(command, {
        ...current.commands,
        phase: current.phase,
        paused: current.hub.paused,
        showMode: current.hub.showMode,
        locked: current.inputLocked,
      });
    });
  }, [channel]);
}
