import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { DataError } from '../../errors';
import { normalizeRoomCode } from '../../roomCode';
import { joinRoomResponseSchema, parseTeamSummaries } from '../../schemas';
import type { JoinRoomResult } from '../../types';
import type { RoomRepo } from '../RoomRepo';
import { callRpc, isRateLimited, unwrap } from './supabaseErrors';

const codeSchema = z.string().min(1);

/** Thin wrapper over the RPCs in 0001_init.sql; the argument names are the SQL parameter names. */
export function createSupabaseRoomRepo(client: SupabaseClient): RoomRepo {
  return {
    async openRoom(eventId): Promise<string> {
      const data = unwrap(await callRpc(client, 'open_room', { p_event_id: eventId }));
      const parsed = codeSchema.safeParse(data);
      if (!parsed.success) throw new DataError('invalid_response', 'open_room returned no code');
      return parsed.data;
    },

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
      const parsed = joinRoomResponseSchema.safeParse(data);
      if (!parsed.success) throw new DataError('invalid_response', 'join_room returned an unexpected value');
      if ('error' in parsed.data) return { ok: false, reason: 'not_found' };
      return {
        ok: true,
        room: { code, eventId: parsed.data.event_id, teams: parseTeamSummaries(parsed.data.teams) },
      };
    },

    async joinRoomAsHost(code): Promise<void> {
      unwrap(await callRpc(client, 'join_room_as_host', { p_code: normalizeRoomCode(code) }));
    },

    async leaveRoom(): Promise<void> {
      unwrap(await callRpc(client, 'leave_room'));
    },

    async touchRoom(code): Promise<void> {
      unwrap(await callRpc(client, 'touch_room', { p_code: normalizeRoomCode(code) }));
    },
  };
}
