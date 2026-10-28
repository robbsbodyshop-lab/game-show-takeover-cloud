import { DataError } from '../../errors';
import { isValidRoomCode, normalizeRoomCode } from '../../roomCode';
import { teamsFromEventState } from '../../schemas';
import type { JoinRoomResult } from '../../types';
import type { RoomRepo } from '../RoomRepo';
import {
  JOIN_MAX_FAILURES,
  JOIN_WINDOW_MS,
  ROOM_TTL_MS,
  attempt,
  memberKey,
  newRoomCode,
  purgeExpiredRooms,
  requireUserId,
  withPersistence,
  type MemoryBackend,
} from './memoryBackend';

export function createMemoryRoomRepo(backend: MemoryBackend): RoomRepo {
  return withPersistence<RoomRepo>(backend, {
    openRoom(eventId) {
      return attempt(() => {
        const userId = requireUserId(backend);
        purgeExpiredRooms(backend);
        const event = backend.events.get(eventId);
        if (event?.ownerId !== userId) throw new DataError('forbidden', 'event_not_found');

        let room = [...backend.rooms.values()].find((r) => r.eventId === eventId);
        if (room) {
          room.lastSeenAt = backend.now();
        } else {
          const now = backend.now();
          room = { code: newRoomCode(backend), eventId, ownerId: userId, createdAt: now, lastSeenAt: now };
          backend.rooms.set(room.code, room);
        }
        backend.members.set(memberKey(room.code, userId), {
          roomCode: room.code,
          userId,
          role: 'stage',
          team: null,
          nickname: null,
        });
        return room.code;
      });
    },

    joinRoom(rawCode, team, nickname) {
      return attempt((): JoinRoomResult => {
        const userId = requireUserId(backend);
        if (!Number.isInteger(team) || team < 1 || team > 8) {
          throw new DataError('unknown', 'invalid_team');
        }
        const now = backend.now();
        const recent = (backend.attempts.get(userId) ?? []).filter((t) => t > now - JOIN_WINDOW_MS);
        backend.attempts.set(userId, recent);
        if (recent.length >= JOIN_MAX_FAILURES) return { ok: false, reason: 'rate_limited' };

        const code = normalizeRoomCode(rawCode);
        const room = isValidRoomCode(code) ? backend.rooms.get(code) : undefined;
        if (!room || room.lastSeenAt <= now - ROOM_TTL_MS) {
          recent.push(now);
          return { ok: false, reason: 'not_found' };
        }

        // A phone sits in one room at a time.
        for (const [key, member] of [...backend.members]) {
          if (member.userId === userId && member.role === 'phone' && member.roomCode !== code) {
            backend.members.delete(key);
          }
        }
        const key = memberKey(code, userId);
        const existing = backend.members.get(key);
        const cleanNick = nickname.trim().slice(0, 24);
        // An owner session keeps its stage / host role (same rule as the SQL upsert).
        if (!existing || existing.role === 'phone') {
          backend.members.set(key, {
            roomCode: code,
            userId,
            role: 'phone',
            team,
            nickname: cleanNick === '' ? null : cleanNick,
          });
        }
        room.lastSeenAt = now;
        const state = backend.states.get(room.eventId)?.state;
        return { ok: true, room: { code, eventId: room.eventId, teams: teamsFromEventState(state) } };
      });
    },

    joinRoomAsHost(rawCode) {
      return attempt(() => {
        const userId = requireUserId(backend);
        const code = normalizeRoomCode(rawCode);
        const room = backend.rooms.get(code);
        if (room?.ownerId !== userId) throw new DataError('forbidden', 'room_not_found');
        backend.members.set(memberKey(code, userId), {
          roomCode: code,
          userId,
          role: 'host',
          team: null,
          nickname: null,
        });
        room.lastSeenAt = backend.now();
      });
    },

    leaveRoom() {
      return attempt(() => {
        const userId = requireUserId(backend);
        for (const [key, member] of [...backend.members]) {
          if (member.userId === userId && member.role === 'phone') backend.members.delete(key);
        }
      });
    },

    touchRoom(rawCode) {
      return attempt(() => {
        const userId = requireUserId(backend);
        const code = normalizeRoomCode(rawCode);
        const room = backend.rooms.get(code);
        if (!room || !backend.members.has(memberKey(code, userId))) {
          throw new DataError('forbidden', 'not_a_member');
        }
        room.lastSeenAt = backend.now();
      });
    },
  });
}
