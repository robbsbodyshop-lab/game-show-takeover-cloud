import type { SupabaseClient } from '@supabase/supabase-js';
import { DataError } from '../../errors';
import { emptySettings, settingsRowSchema, toSettingsRecord } from '../../schemas';
import type { HostSettingsRecord } from '../../types';
import type { SettingsRepo } from '../SettingsRepo';
import { unwrap } from './supabaseErrors';

const COLUMNS = 'feud, wheel, app';

export function createSupabaseSettingsRepo(client: SupabaseClient): SettingsRepo {
  const parse = (row: unknown): HostSettingsRecord => {
    const parsed = settingsRowSchema.safeParse(row);
    if (!parsed.success) throw new DataError('invalid_response', 'Unexpected settings response');
    return toSettingsRecord(parsed.data);
  };

  return {
    async load(): Promise<HostSettingsRecord> {
      // RLS limits the table to the caller's own row.
      const row = unwrap(await client.from('host_settings').select(COLUMNS).maybeSingle());
      return row === null ? emptySettings() : parse(row);
    },

    async save(partial): Promise<HostSettingsRecord> {
      const { data } = await client.auth.getSession();
      const ownerId = data.session?.user.id;
      if (ownerId === undefined) throw new DataError('not_authenticated', 'Not signed in');

      // Only the groups present in `partial` are written, so other groups keep their value.
      const values: Record<string, unknown> = { owner_id: ownerId };
      if (partial.feud !== undefined) values.feud = partial.feud;
      if (partial.wheel !== undefined) values.wheel = partial.wheel;
      if (partial.app !== undefined) values.app = partial.app;

      const row = unwrap(
        await client
          .from('host_settings')
          .upsert(values, { onConflict: 'owner_id' })
          .select(COLUMNS)
          .single(),
      );
      return parse(row);
    },
  };
}
