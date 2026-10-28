/**
 * The `data` of a `kind: 'hub'` snapshot: the event-level facts the host view shows next to every
 * console (FR-013). The stage fills it in; the reader below tolerates anything missing or malformed so
 * a host view never crashes on a stage that is a version behind (TD-008).
 *
 * Hub commands (`target: 'hub'`) and their args:
 *   pause | resume | quit-game | reset-scores   no args
 *   buzz                                         teamId 1..8
 *   show-mode                                    args { on: boolean }
 */
import { z } from 'zod';
import { SNAPSHOT_KINDS, type SnapshotKind } from './hostProtocol';

export interface HubTeamRow {
  id: number;
  name: string;
  color: string;
  score: number;
  chips: number;
}

/** A running or paused clock. While paused (or `endsAt` null) `remainingMs` is shown as is. */
export interface HubClock {
  id: string;
  label: string;
  endsAt: number | null;
  remainingMs: number | null;
}

export interface HubRosterEntry {
  team: number;
  nickname: string;
}

export interface HubSnapshotData {
  /** Event phase or screen name, for example "hub", "feud:face-off". */
  phase: string;
  paused: boolean;
  showMode: boolean;
  /** False when the stage page is in a background tab or minimised (timers throttle). */
  gameVisible: boolean;
  /** The game whose console should show next to the hub, or null at the hub itself. */
  activeGame: SnapshotKind | null;
  roomCode: string | null;
  teams: HubTeamRow[];
  clocks: HubClock[];
  /** Connected phones. */
  roster: HubRosterEntry[];
  /** Team ids in play order, if the doors were drawn. */
  playOrder: number[] | null;
}

const teamRow = z.object({
  id: z.number().int(),
  name: z.string().catch(''),
  color: z.string().catch(''),
  score: z.number().catch(0),
  chips: z.number().catch(0),
});

const clock = z.object({
  id: z.string().catch(''),
  label: z.string().catch(''),
  endsAt: z.number().nullable().catch(null),
  remainingMs: z.number().nullable().catch(null),
});

const rosterEntry = z.object({ team: z.number().int(), nickname: z.string().catch('') });

export const DEFAULT_HUB_DATA: HubSnapshotData = {
  phase: '',
  paused: false,
  showMode: false,
  gameVisible: true,
  activeGame: null,
  roomCode: null,
  teams: [],
  clocks: [],
  roster: [],
  playOrder: null,
};

const hubSchema = z.object({
  phase: z.string().catch(DEFAULT_HUB_DATA.phase),
  paused: z.boolean().catch(false),
  showMode: z.boolean().catch(false),
  gameVisible: z.boolean().catch(true),
  activeGame: z.enum(SNAPSHOT_KINDS).nullable().catch(null),
  roomCode: z.string().nullable().catch(null),
  teams: z.array(teamRow).catch([]),
  clocks: z.array(clock).catch([]),
  roster: z.array(rosterEntry).catch([]),
  playOrder: z.array(z.number().int()).nullable().catch(null),
});

/** Never throws; anything that is not an object gives the defaults. */
export function readHubData(raw: unknown): HubSnapshotData {
  const parsed = hubSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_HUB_DATA;
}

export const formatClock = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes)}:${String(seconds).padStart(2, '0')}`;
};
