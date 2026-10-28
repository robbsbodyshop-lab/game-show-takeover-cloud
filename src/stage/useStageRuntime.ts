import { useEffect, useState, useSyncExternalStore } from 'react';
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
  /** False while this stage is read-only (another stage holds the event): no room, no transport. */
  enabled: boolean;
}

/** Owns one `StageRuntime` for the mounted event stage. */
export function useStageRuntime(options: UseStageRuntimeOptions): RuntimeSnapshot {
  const { eventId, userId, data, createTransport, teams, audience, enabled } = options;
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
    if (!enabled) return;
    runtime.start();
    return () => {
      runtime.stop();
    };
  }, [runtime, enabled]);

  useEffect(() => {
    runtime.publishAudience(audience);
  }, [runtime, audience]);

  return useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
}
