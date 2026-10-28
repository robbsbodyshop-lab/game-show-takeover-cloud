import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { DataLayer, TeamSummary } from '@/data';
import type { Role, RoomTransport } from '@/realtime';
import { createStageHostChannel } from './hostChannelAdapter';
import { StageRuntime, type AudiencePayload, type RuntimeSnapshot } from './stageRuntime';

export interface UseStageRuntimeOptions {
  eventId: string;
  userId: string;
  data: DataLayer;
  createTransport: (role: Role) => RoomTransport;
  teams: TeamSummary[];
  audience: AudiencePayload;
}

export interface StageRuntimeHandle {
  snapshot: RuntimeSnapshot;
  /** Another stage proved to be the director (save conflict): go read-only and release the lease. */
  demote: () => void;
}

/**
 * Owns one `StageRuntime` for the mounted event stage. The runtime claims the director lease first and
 * only then opens the room (`snapshot.lease` is `readonly` when another stage is running this event).
 */
export function useStageRuntime(options: UseStageRuntimeOptions): StageRuntimeHandle {
  const { eventId, userId, data, createTransport, teams, audience } = options;
  const [runtime] = useState(
    () =>
      new StageRuntime({
        eventId,
        userId,
        data,
        createTransport,
        createHostChannel: createStageHostChannel,
        teams,
      }),
  );

  useEffect(() => {
    runtime.setTeams(teams);
  }, [runtime, teams]);

  useEffect(() => {
    runtime.start();
    return () => {
      runtime.stop();
    };
  }, [runtime]);

  useEffect(() => {
    runtime.publishAudience(audience);
  }, [runtime, audience]);

  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const demote = useCallback(() => {
    runtime.demote();
  }, [runtime]);
  return { snapshot, demote };
}
