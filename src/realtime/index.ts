import { MemoryRoomTransport, type MemoryTransportDeps } from './MemoryRoomTransport';
import type { RoomTransport } from './RoomTransport';
import { SupabaseRoomTransport, type SupabaseTransportDeps } from './SupabaseRoomTransport';

export * from './roomCodes';
export * from './schemas';
export * from './roles';
export type {
  ConnectOptions,
  ConnectionStatus,
  PresenceEntry,
  RoomTransport,
  StatusHandler,
} from './RoomTransport';
export { sortRoster } from './RoomTransport';
export {
  MemoryRoomHub,
  MemoryRoomTransport,
  type MemoryTransportDeps,
  type SimulateDisconnectOptions,
} from './MemoryRoomTransport';
export {
  SupabaseRoomTransport,
  backoffDelay,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
  type RealtimeChannelLike,
  type SupabaseLike,
  type SupabaseTransportDeps,
} from './SupabaseRoomTransport';

export function createRoomTransport(kind: 'memory', deps: MemoryTransportDeps): RoomTransport;
export function createRoomTransport(kind: 'supabase', deps: SupabaseTransportDeps): RoomTransport;
export function createRoomTransport(
  kind: 'memory' | 'supabase',
  deps: MemoryTransportDeps | SupabaseTransportDeps,
): RoomTransport {
  if (kind === 'memory') return new MemoryRoomTransport(deps as MemoryTransportDeps);
  return new SupabaseRoomTransport(deps as SupabaseTransportDeps);
}
