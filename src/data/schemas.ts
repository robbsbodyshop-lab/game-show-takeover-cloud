import { z } from 'zod';
import type { EventRecord, EventStateRecord, HostSettingsRecord, TeamSummary } from './types';

/** Boundary schemas (TD-008): everything that comes back from Postgres is parsed, never trusted. */

const isoDate = z.string().min(1);

export const eventRowSchema = z.object({
  id: z.string().min(1),
  owner_id: z.string().min(1),
  name: z.string(),
  status: z.enum(['setup', 'live', 'finished']),
  created_at: isoDate,
  updated_at: isoDate,
});

export const eventStateRowSchema = z.object({
  event_id: z.string().min(1),
  rev: z.coerce.number().int().nonnegative(),
  state: z.unknown(),
  saved_at: isoDate,
});

const group = z.record(z.string(), z.unknown());

export const settingsRowSchema = z.object({
  feud: group,
  wheel: group,
  app: group,
});

export const teamSummarySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  color: z.string(),
});

export const joinRoomResponseSchema = z.union([
  z.object({ error: z.string() }),
  z.object({ event_id: z.string().min(1), teams: z.array(z.unknown()) }),
]);

export function toEventRecord(row: z.infer<typeof eventRowSchema>): EventRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toEventStateRecord(row: z.infer<typeof eventStateRowSchema>): EventStateRecord {
  return { eventId: row.event_id, rev: row.rev, state: row.state ?? null, savedAt: row.saved_at };
}

export function toSettingsRecord(row: z.infer<typeof settingsRowSchema>): HostSettingsRecord {
  return { feud: row.feud, wheel: row.wheel, app: row.app };
}

export function emptySettings(): HostSettingsRecord {
  return { feud: {}, wheel: {}, app: {} };
}

/**
 * Picks `{ id, name, color }` from an array of team-like objects and drops anything else, so extra
 * fields (player names, scores) can never reach a phone and a malformed entry cannot crash a join.
 */
export function parseTeamSummaries(value: unknown): TeamSummary[] {
  if (!Array.isArray(value)) return [];
  const teams: TeamSummary[] = [];
  for (const item of value as unknown[]) {
    const parsed = teamSummarySchema.safeParse(item);
    if (parsed.success) {
      teams.push({ id: parsed.data.id, name: parsed.data.name, color: parsed.data.color });
    }
  }
  return teams;
}

/** Teams as join_room reports them, read from a saved EventSession. */
export function teamsFromEventState(state: unknown): TeamSummary[] {
  if (typeof state !== 'object' || state === null) return [];
  return parseTeamSummaries((state as { teams?: unknown }).teams);
}
