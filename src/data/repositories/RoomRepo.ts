import type { JoinRoomResult } from '../types';

/** Phone rooms (design.md section 4). All writes go through security definer RPCs. */
export interface RoomRepo {
  /** Owner only. One room per event: returns the existing code when the room is already open. */
  openRoom(eventId: string): Promise<string>;
  /** Any signed-in user, anonymous included. Bad, expired or malformed codes are `not_found`. */
  joinRoom(code: string, team: number, nickname: string): Promise<JoinRoomResult>;
  /** Owner only: attach a host view to the room. */
  joinRoomAsHost(code: string): Promise<void>;
  /** Removes the caller's phone membership. */
  leaveRoom(): Promise<void>;
  /** Members only: keeps the room alive (12 hours after the last touch). */
  touchRoom(code: string): Promise<void>;
}
