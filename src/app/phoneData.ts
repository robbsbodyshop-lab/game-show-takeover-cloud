import type { DataLayer } from '@/data';
import { DataError } from '@/data/errors';
import type { AuthService } from '@/data/repositories/AuthService';
import type { EventRepo } from '@/data/repositories/EventRepo';
import type { RoomRepo } from '@/data/repositories/RoomRepo';
import type { SettingsRepo } from '@/data/repositories/SettingsRepo';

/**
 * The phone's data layer (NFR-004): anonymous sign-in plus the room RPCs of `phoneRooms.ts`, and no
 * events or settings. It avoids the full repositories because those pull zod (about 25 KB gzipped)
 * and code a phone never runs.
 */

/** A repository the phone does not have: every method rejects with a clear error. */
export const unsupportedRepo = (what: string): object =>
  new Proxy(
    {},
    {
      get: (_target, method) => () =>
        Promise.reject(new DataError('forbidden', `The phone has no ${what} (${String(method)})`)),
    },
  );

/** Phone data layer over `auth` (any mode) and the supabase `client` when there is one. */
export function createPhoneDataLayer(mode: DataLayer['mode'], auth: AuthService, rooms: RoomRepo): DataLayer {
  return {
    mode,
    auth,
    rooms,
    events: unsupportedRepo('events') as EventRepo,
    settings: unsupportedRepo('settings') as SettingsRepo,
  };
}
