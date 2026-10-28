import type { SupabaseClient } from '@supabase/supabase-js';
import { DataError } from '@/data/errors';
import { normalizeRoomCode } from '@/data/roomCode';
import { callRpc, isRateLimited, unwrap } from '@/data/repositories/supabase/supabaseErrors';
import type { RoomRepo } from '@/data/repositories/RoomRepo';
import type { JoinRoomResult, TeamSummary } from '@/data/types';

/**
 * The phone's room repository (NFR-004): the `join_room`, `touch_room` and `leave_room` RPCs and
 * nothing else. The full repository parses with zod (about 25 KB gzipped); the response is checked
 * by hand here instead.
 */

/** Keeps `{ id, name, color }` of every well-formed team and drops the rest (same rule as the data layer). */
export function teamsFromRpc(value: unknown): TeamSummary[] {
  if (!Array.isArray(value)) return [];
  const teams: TeamSummary[] = [];
  for (const item of value as unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const { id, name, color } = item as Record<string, unknown>;
    if (
      typeof id === 'number' &&
      Number.isInteger(id) &&
      typeof name === 'string' &&
      typeof color === 'string'
    ) {
      teams.push({ id, name, color });
    }
  }
  return teams;
}

export function createPhoneRoomRepo(client: SupabaseClient): RoomRepo {
  return {
    async joinRoom(rawCode, team, nickname): Promise<JoinRoomResult> {
      const code = normalizeRoomCode(rawCode);
      const { data, error } = await callRpc(client, 'join_room', {
        p_code: code,
        p_team: team,
        p_nickname: nickname,
      });
      if (error) {
        if (isRateLimited(error)) return { ok: false, reason: 'rate_limited' };
        throw new DataError('unknown', error.message, { cause: error });
      }
      const body = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null;
      if (body !== null && typeof body.error === 'string') return { ok: false, reason: 'not_found' };
      if (
        body === null ||
        typeof body.event_id !== 'string' ||
        body.event_id === '' ||
        !Array.isArray(body.teams)
      ) {
        throw new DataError('invalid_response', 'join_room returned an unexpected value');
      }
      return { ok: true, room: { code, eventId: body.event_id, teams: teamsFromRpc(body.teams) } };
    },

    async leaveRoom(): Promise<void> {
      unwrap(await callRpc(client, 'leave_room'));
    },

    async touchRoom(code): Promise<void> {
      unwrap(await callRpc(client, 'touch_room', { p_code: normalizeRoomCode(code) }));
    },

    openRoom: () => Promise.reject(new DataError('forbidden', 'The phone cannot open rooms')),
    joinRoomAsHost: () => Promise.reject(new DataError('forbidden', 'The phone cannot host rooms')),
  };
}
