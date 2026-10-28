/**
 * zod schema for a saved EventSession (TD-008: invalid data must never crash a live show) and
 * the migration hook for future schema versions.
 */
import { z } from 'zod';
import type { EventSession } from './types';
import { MAX_TEAMS, MIN_TEAMS } from './types';

const teamId = z.number().int().min(1).max(MAX_TEAMS);
const mainGame = z.enum(['feud', 'wheel']);
const phase = z.enum(['setup', 'doors', 'hub', 'feud', 'wheel', 'speed', 'plinko', 'puzzle', 'winner']);

const teamSchema = z.object({
  id: teamId,
  name: z.string().min(1),
  color: z.string().min(1),
  players: z.array(z.string()),
  score: z.number().int(),
  chips: z.number().int().min(0),
});

const bracketMatch = z.object({
  round: z.number().int().min(0),
  slot: z.number().int().min(0),
  a: teamId.nullable(),
  b: teamId.nullable(),
  winner: teamId.nullable(),
  bye: z.boolean(),
});

const bracketSchema = z.object({
  seeds: z.array(teamId).min(MIN_TEAMS).max(MAX_TEAMS),
  rounds: z.array(z.array(bracketMatch).min(1)).min(1),
});

const doorsSchema = z.object({
  stage: z.enum(['picking', 'revealing', 'done']),
  doorCount: z.number().int().min(1).max(MAX_TEAMS),
  picks: z.array(z.object({ team: teamId, door: z.number().int().min(1).max(MAX_TEAMS) })),
  positions: z.array(z.number().int().min(1).max(MAX_TEAMS)).nullable(),
});

const plinkoSchema = z.object({
  selections: z.array(z.object({ team: teamId, column: z.number().int().min(0) })),
  drops: z.array(
    z.object({
      team: teamId,
      column: z.number().int().min(0),
      xs: z.array(z.number().int().min(0)),
      slot: z.number().int().min(0),
      points: z.number().int(),
    }),
  ),
});

const speedSchema = z.object({
  status: z.enum(['idle', 'running', 'paused', 'timeUp']),
  durationMs: z.number().int().positive(),
  endsAt: z.number().nullable(),
  remainingMs: z.number().min(0),
});

const settingsSchema = z.object({
  speedRoundMs: z.number().int().positive(),
  plinkoSlotValues: z.array(z.number().int()).length(9),
});

const gameSchema = z.object({
  kind: mainGame,
  instanceSeed: z.number(),
  state: z.unknown(),
});

export const eventSessionSchema: z.ZodType<EventSession> = z
  .object({
    schemaVersion: z.literal(1),
    teams: z.array(teamSchema).min(MIN_TEAMS).max(MAX_TEAMS),
    phase,
    availableMainGames: z.array(mainGame),
    completedGames: z.array(mainGame),
    usedContentIds: z.array(z.string()),
    playOrder: z.array(teamId).nullable(),
    bracket: bracketSchema.nullable(),
    gameInstance: z.number().int().min(0),
    game: gameSchema.nullable(),
    doors: doorsSchema.nullable(),
    plinko: plinkoSchema.nullable(),
    speed: speedSchema.nullable(),
    settings: settingsSchema,
  })
  .superRefine((s, ctx) => {
    const issue = (message: string): void => {
      ctx.addIssue({ code: 'custom', message });
    };
    const ids = s.teams.map((t) => t.id);
    if (!ids.every((id, i) => id === i + 1)) issue('team ids must be 1..n in list order');
    const known = (id: number): boolean => ids.includes(id);
    if (s.playOrder && (s.playOrder.length !== ids.length || !ids.every((id) => s.playOrder?.includes(id)))) {
      issue('playOrder must be a permutation of the team ids');
    }
    if (s.bracket && !s.bracket.seeds.every(known)) issue('bracket seeds must be team ids');
    if (s.phase === 'doors' && !s.doors) issue('doors phase needs doors state');
    if (s.phase === 'plinko' && !s.plinko) issue('plinko phase needs plinko state');
    if (s.phase === 'speed' && !s.speed) issue('speed phase needs speed state');
    if (s.game && s.game.kind !== s.phase) issue('running game must match the phase');
  });

/**
 * Bring a stored value to the current schema version. Version 1 is current, so this is the
 * identity for it; versions this build does not know (newer, or garbage) give null.
 * Add one `case` per released version when the shape changes.
 */
export function migrateSession(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || !('schemaVersion' in raw)) return null;
  switch (raw.schemaVersion) {
    case 1:
      return raw;
    default:
      return null;
  }
}

/** Validate a saved session; null when it is missing, from an unknown version, or malformed. */
export function parseSession(raw: unknown): EventSession | null {
  const migrated = migrateSession(raw);
  if (migrated === null) return null;
  const result = eventSessionSchema.safeParse(migrated);
  return result.success ? result.data : null;
}
