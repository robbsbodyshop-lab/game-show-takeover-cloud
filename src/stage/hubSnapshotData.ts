/** Builds the `kind: 'hub'` snapshot data the host view reads (`src/host/hubSnapshot.ts`). */
import type { HubSnapshotData } from '@/host/hubSnapshot';
import type { SnapshotKind } from '@/host/hostProtocol';
import { teamsInPlayOrder, type EventSession, type GamePhase } from '@/engines/event';
import type { ConnectionStatus, PresenceEntry } from '@/realtime';

/** The hub snapshot plus two fields the host reader may ignore today (zod strips unknown keys). */
export interface StageHubData extends HubSnapshotData {
  connection: ConnectionStatus;
  dialogOpen: boolean;
}

const GAME_KIND: Partial<Record<GamePhase, SnapshotKind>> = {
  feud: 'feud',
  wheel: 'wheel',
  puzzle: 'puzzle',
  speed: 'speed',
  plinko: 'plinko',
};

export interface HubDataInput {
  session: EventSession;
  paused: boolean;
  showMode: boolean;
  dialogOpen: boolean;
  roomCode: string | null;
  status: ConnectionStatus;
  roster: readonly PresenceEntry[];
}

/** Everything except `gameVisible`, which is read from the document each time it is published. */
export function buildHubData(input: HubDataInput): Omit<StageHubData, 'gameVisible'> {
  const { session } = input;
  const speed = session.speed;
  return {
    phase: session.phase,
    paused: input.paused,
    showMode: input.showMode,
    dialogOpen: input.dialogOpen,
    connection: input.status,
    activeGame: GAME_KIND[session.phase] ?? null,
    roomCode: input.roomCode,
    teams: session.teams.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      score: t.score,
      chips: t.chips,
    })),
    clocks: speed
      ? [{ id: 'speed', label: 'Speed Round', endsAt: speed.endsAt, remainingMs: speed.remainingMs }]
      : [],
    roster: input.roster
      .filter((entry) => entry.role === 'phone')
      .map((entry) => ({ team: entry.team, nickname: entry.nickname })),
    playOrder: session.playOrder ? teamsInPlayOrder(session).map((t) => t.id) : null,
  };
}
