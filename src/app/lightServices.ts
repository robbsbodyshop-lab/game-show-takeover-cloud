import type { DataLayer } from '@/data';
import { DataError } from '@/data/errors';
import type { RoomTransport } from '@/realtime';
import type { AppServices } from './AppContext';
import { appMode } from './env';
import { createPhoneDataLayer, unsupportedRepo } from './phoneData';
import { createSilentAudio } from './silentAudio';
import type { RoomRepo } from '@/data/repositories/RoomRepo';

/**
 * Services for the phone (`play.html`) and the host console (`host.html`), built without the stage
 * pieces: no audio player, no content, no engines (NFR-004). The mode decides what is downloaded:
 * the Supabase client only in supabase mode, the in-memory backend and the BroadcastChannel hub only
 * in demo mode. Both are dynamic imports, so a page fetches one of them.
 *
 *  - phone: auth and the join/touch/leave RPCs only (`phoneData.ts`), no zod-based repositories.
 *  - host: the full repositories (sign-in, rooms, settings).
 *
 * Demo data is not persisted here (`storage` stays unset): the stage tab owns `gst:demo:db`, and a
 * phone or host tab writing a stale copy over it would erase the stage's events.
 */
export type LightKind = 'phone' | 'host';
type Parts = Pick<AppServices, 'data' | 'createTransport'>;

async function supabaseParts(kind: LightKind): Promise<Parts> {
  const [{ getConfiguredClient }, { createSupabaseAuthService }, { SupabaseRoomTransport }] =
    await Promise.all([
      import('@/data/supabaseClient'),
      import('@/data/repositories/supabase/SupabaseAuthService'),
      import('@/realtime/SupabaseRoomTransport'),
    ]);
  const client = getConfiguredClient();
  if (!client) {
    throw new DataError(
      'unavailable',
      'Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY)',
    );
  }
  const auth = createSupabaseAuthService(client);
  let data: DataLayer;
  if (kind === 'phone') {
    const { createPhoneRoomRepo } = await import('./phoneRooms');
    data = createPhoneDataLayer('supabase', auth, createPhoneRoomRepo(client));
  } else {
    const repos = await import('@/data/repositories/supabase');
    data = {
      mode: 'supabase',
      auth,
      events: repos.createSupabaseEventRepo(client),
      settings: repos.createSupabaseSettingsRepo(client),
      rooms: repos.createSupabaseRoomRepo(client),
    };
  }
  return { data, createTransport: (): RoomTransport => new SupabaseRoomTransport({ client }) };
}

async function demoParts(kind: LightKind): Promise<Parts> {
  const [memory, { BroadcastRoomHub }, { MemoryRoomTransport }] = await Promise.all([
    import('@/data/repositories/memory/memoryBackend'),
    import('@/realtime/BroadcastRoomHub'),
    import('@/realtime/MemoryRoomTransport'),
  ]);
  const backend = memory.createMemoryBackend();
  const { createMemoryAuthService } = await import('@/data/repositories/memory/MemoryAuthService');
  const auth = createMemoryAuthService(backend);
  let data: DataLayer;
  if (kind === 'phone') {
    // A demo phone never calls the room RPCs: its backend knows no room (see usePhoneFlow).
    data = createPhoneDataLayer('demo', auth, unsupportedRepo('rooms') as RoomRepo);
  } else {
    const repos = await import('@/data/repositories/memory');
    data = {
      mode: 'demo',
      auth,
      events: repos.createMemoryEventRepo(backend),
      settings: repos.createMemorySettingsRepo(backend),
      rooms: repos.createMemoryRoomRepo(backend),
    };
  }
  const hub = new BroadcastRoomHub();
  return { data, createTransport: (): RoomTransport => new MemoryRoomTransport({ hub }) };
}

export async function buildLightServices(kind: LightKind): Promise<AppServices> {
  const mode = appMode();
  const parts = mode === 'supabase' ? await supabaseParts(kind) : await demoParts(kind);
  return { mode, ...parts, audio: createSilentAudio(), version: __APP_VERSION__ };
}
