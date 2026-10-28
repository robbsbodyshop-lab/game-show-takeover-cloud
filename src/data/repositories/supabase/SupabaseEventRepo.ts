import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { DataError } from '../../errors';
import { eventRowSchema, eventStateRowSchema, toEventRecord, toEventStateRecord } from '../../schemas';
import type { EventRecord, EventStateRecord, SaveStateResult } from '../../types';
import type { ClaimDirectorResult, EventRepo } from '../EventRepo';
import { callRpc, unwrap } from './supabaseErrors';

const EVENT_COLUMNS = 'id, owner_id, name, status, created_at, updated_at';
const STATE_COLUMNS = 'event_id, rev, state, saved_at';

const claimDirectorSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), holder_seen_at: z.string().nullable().optional() }),
]);

function parseOrThrow<T>(parse: () => T): T {
  try {
    return parse();
  } catch (cause) {
    throw new DataError('invalid_response', 'Unexpected response from Supabase', { cause });
  }
}

export function createSupabaseEventRepo(client: SupabaseClient): EventRepo {
  return {
    async listEvents(): Promise<EventRecord[]> {
      const rows = unwrap(
        await client.from('events').select(EVENT_COLUMNS).order('created_at', { ascending: false }),
      );
      return parseOrThrow(() => eventRowSchema.array().parse(rows).map(toEventRecord));
    },

    async createEvent(name): Promise<EventRecord> {
      // owner_id defaults to auth.uid() and the event_state slot is created by trigger.
      const row = unwrap(
        await client.from('events').insert({ name: name.trim() }).select(EVENT_COLUMNS).single(),
      );
      return parseOrThrow(() => toEventRecord(eventRowSchema.parse(row)));
    },

    async getEvent(id): Promise<EventRecord | null> {
      const row = unwrap(await client.from('events').select(EVENT_COLUMNS).eq('id', id).maybeSingle());
      return row === null ? null : parseOrThrow(() => toEventRecord(eventRowSchema.parse(row)));
    },

    async loadState(id): Promise<EventStateRecord | null> {
      const row = unwrap(
        await client.from('event_state').select(STATE_COLUMNS).eq('event_id', id).maybeSingle(),
      );
      return row === null ? null : parseOrThrow(() => toEventStateRecord(eventStateRowSchema.parse(row)));
    },

    async saveState(id, state, expectedRev): Promise<SaveStateResult> {
      const nextRev = expectedRev + 1;
      // Compare-and-set: only the writer that holds the current rev updates the row.
      const rows = unwrap(
        await client
          .from('event_state')
          .update({ rev: nextRev, state })
          .eq('event_id', id)
          .eq('rev', expectedRev)
          .select('rev'),
      );
      if (Array.isArray(rows) && rows.length > 0) return { ok: true, rev: nextRev };

      // Zero rows: either another stage saved first (conflict) or the event is not ours.
      const current = unwrap(await client.from('event_state').select('rev').eq('event_id', id).maybeSingle());
      if (current === null) throw new DataError('not_found', 'Event not found');
      return { ok: false, reason: 'conflict' };
    },

    async finishEvent(id): Promise<void> {
      const rows = unwrap(
        await client.from('events').update({ status: 'finished' }).eq('id', id).select('id'),
      );
      if (!Array.isArray(rows) || rows.length === 0) throw new DataError('not_found', 'Event not found');
    },

    async claimDirector(eventId, sessionId, ttlSeconds): Promise<ClaimDirectorResult> {
      // Argument names are the SQL parameter names in 0002_director_lease.sql; the ttl default lives there.
      const data = unwrap(
        await callRpc(client, 'claim_director', {
          p_event_id: eventId,
          p_session: sessionId,
          ...(ttlSeconds === undefined ? {} : { p_ttl_seconds: ttlSeconds }),
        }),
      );
      const parsed = parseOrThrow(() => claimDirectorSchema.parse(data));
      return parsed.ok ? { ok: true } : { ok: false, holderSeenAt: parsed.holder_seen_at ?? null };
    },

    async releaseDirector(eventId, sessionId): Promise<void> {
      unwrap(await callRpc(client, 'release_director', { p_event_id: eventId, p_session: sessionId }));
    },

    async deleteEvent(id): Promise<void> {
      unwrap(await client.from('events').delete().eq('id', id));
    },
  };
}
