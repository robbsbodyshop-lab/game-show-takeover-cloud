import type { ReactNode } from 'react';
import { HostDrawer } from '@/host/HostDrawer';
import type { CommandResult, HostSend } from '@/host/hostProtocol';
import type { StageHostChannel } from './hostChannelAdapter';
import { useHostDrawerSnapshot } from './useHostDrawerSnapshot';

export interface StageHostDrawerProps {
  channel: StageHostChannel | null;
  open: boolean;
  onClose: () => void;
  /** The Settings tab: the same form the Settings dialog shows. */
  settings: ReactNode;
}

const NO_CHANNEL: CommandResult = { applied: false, reason: 'no-channel' };
const sendNowhere: HostSend = () => NO_CHANNEL;

/**
 * The F2 drawer on the stage window, fed from the stage's own host channel: snapshots are read in
 * process and commands go straight into the channel's dispatcher (no network, no `result` message).
 * It is a separate component so the 2 s hub republish re-renders only the drawer, not the whole stage,
 * and it listens to the channel only while open.
 */
export const StageHostDrawer = ({ channel, open, onClose, settings }: StageHostDrawerProps) => {
  const snapshot = useHostDrawerSnapshot(open ? channel : null);
  return (
    <HostDrawer
      open={open}
      onClose={onClose}
      snapshot={snapshot}
      send={channel ? channel.dispatchLocal : sendNowhere}
      settings={settings}
    />
  );
};
