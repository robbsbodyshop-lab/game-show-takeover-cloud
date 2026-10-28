import type { HostBridge } from '@/host/hostProtocol';
import { LOCKED_REASON } from './hubCommands';

/** A mutable flag shared between React (which sets it) and the bridges (which read it at call time). */
export class LockFlag {
  private locked = false;

  set(value: boolean): void {
    this.locked = value;
  }

  get isLocked(): boolean {
    return this.locked;
  }
}

/**
 * Wraps the host bridge a game receives so that, while the stage is paused or a dialog is open,
 * every host command is refused (FR-015) and every published snapshot says `inputLocked: true`.
 * The game also gets `inputLocked` as a prop; this makes the rule hold even if a game forgets it.
 */
export function lockHostBridge(bridge: HostBridge, lock: LockFlag): HostBridge {
  return {
    publishSnapshot(snapshot) {
      bridge.publishSnapshot(
        lock.isLocked && !snapshot.inputLocked ? { ...snapshot, inputLocked: true } : snapshot,
      );
    },
    onCommand(target, handler) {
      return bridge.onCommand(target, (command) =>
        lock.isLocked ? { applied: false, reason: LOCKED_REASON } : handler(command),
      );
    },
  };
}
