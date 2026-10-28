import type { SupabaseClient } from '@supabase/supabase-js';
import { DataError } from './errors';
import type { AuthService } from './repositories/AuthService';
import type { EventRepo } from './repositories/EventRepo';
import type { RoomRepo } from './repositories/RoomRepo';
import type { SettingsRepo } from './repositories/SettingsRepo';
import {
  createMemoryAuthService,
  createMemoryBackend,
  createMemoryEventRepo,
  createMemoryRoomRepo,
  createMemorySettingsRepo,
  type MemoryBackendOptions,
} from './repositories/memory';
import {
  createSupabaseAuthService,
  createSupabaseEventRepo,
  createSupabaseRoomRepo,
  createSupabaseSettingsRepo,
} from './repositories/supabase';
import { getConfiguredClient } from './supabaseClient';

export type DataMode = 'demo' | 'supabase';

export interface DataLayer {
  mode: DataMode;
  auth: AuthService;
  events: EventRepo;
  settings: SettingsRepo;
  rooms: RoomRepo;
}

export interface DataLayerOptions {
  /** supabase mode: use this client instead of the one built from VITE_* variables. */
  client?: SupabaseClient;
  /** demo mode: injectable clock, randomness and ids (tests). */
  memory?: MemoryBackendOptions;
}

/**
 * Wires the repositories for a mode. `demo` is in-memory and needs no network; `supabase` needs a
 * configured client (throws `DataError('unavailable')` otherwise).
 */
export function createDataLayer(mode: DataMode, options: DataLayerOptions = {}): DataLayer {
  if (mode === 'demo') {
    const backend = createMemoryBackend(options.memory);
    return {
      mode,
      auth: createMemoryAuthService(backend),
      events: createMemoryEventRepo(backend),
      settings: createMemorySettingsRepo(backend),
      rooms: createMemoryRoomRepo(backend),
    };
  }

  const client = options.client ?? getConfiguredClient();
  if (!client) {
    throw new DataError(
      'unavailable',
      'Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY)',
    );
  }
  return {
    mode,
    auth: createSupabaseAuthService(client),
    events: createSupabaseEventRepo(client),
    settings: createSupabaseSettingsRepo(client),
    rooms: createSupabaseRoomRepo(client),
  };
}

export { DataError, type DataErrorCode } from './errors';
export {
  clearCached,
  createPersistence,
  loadCached,
  type CachedState,
  type Persistence,
  type PersistenceOptions,
} from './persistence';
export { createSupabaseClient, getConfiguredClient } from './supabaseClient';
export { ROOM_CODE_ALPHABET, generateRoomCode, isValidRoomCode, normalizeRoomCode } from './roomCode';
export type { AuthService } from './repositories/AuthService';
export type { EventRepo } from './repositories/EventRepo';
export type { RoomRepo } from './repositories/RoomRepo';
export type { SettingsRepo } from './repositories/SettingsRepo';
export type * from './types';
