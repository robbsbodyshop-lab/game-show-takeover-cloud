import { DataError } from '../../errors';
import type { EventRecord, EventStateRecord, SaveStateResult } from '../../types';
import { DEFAULT_DIRECTOR_TTL_SECONDS, type ClaimDirectorResult, type EventRepo } from '../EventRepo';
import { attempt, isoNow, requireUserId, toJson, type MemoryBackend } from './memoryBackend';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createMemoryEventRepo(backend: MemoryBackend): EventRepo {
  const owned = (id: string, userId: string): EventRecord | null => {
    const event = backend.events.get(id);
    return event?.ownerId === userId ? event : null;
  };

  return {
    listEvents() {
      return attempt(() => {
        const userId = requireUserId(backend);
        // Reversed first so events created in the same millisecond still list newest first.
        const events = [...backend.events.values()]
          .filter((e) => e.ownerId === userId)
          .reverse()
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return clone(events);
      });
    },

    createEvent(name) {
      return attempt(() => {
        const userId = requireUserId(backend);
        const trimmed = name.trim();
        if (trimmed.length < 1 || trimmed.length > 120) {
          throw new DataError('unknown', 'Event name must be 1 to 120 characters');
        }
        const now = isoNow(backend);
        const event: EventRecord = {
          id: backend.newId(),
          ownerId: userId,
          name: trimmed,
          status: 'setup',
          createdAt: now,
          updatedAt: now,
        };
        backend.events.set(event.id, event);
        backend.states.set(event.id, { eventId: event.id, rev: 0, state: null, savedAt: now });
        return clone(event);
      });
    },

    getEvent(id) {
      return attempt(() => {
        const event = owned(id, requireUserId(backend));
        return event ? clone(event) : null;
      });
    },

    loadState(id) {
      return attempt((): EventStateRecord | null => {
        const userId = requireUserId(backend);
        const record = owned(id, userId) ? backend.states.get(id) : undefined;
        return record ? { ...record, state: toJson(record.state) } : null;
      });
    },

    saveState(id, state, expectedRev) {
      return attempt((): SaveStateResult => {
        const userId = requireUserId(backend);
        const current = owned(id, userId) ? backend.states.get(id) : undefined;
        if (!current) throw new DataError('not_found', 'Event not found');
        if (current.rev !== expectedRev) return { ok: false, reason: 'conflict' };
        const next: EventStateRecord = {
          eventId: id,
          rev: expectedRev + 1,
          state: toJson(state),
          savedAt: isoNow(backend),
        };
        backend.states.set(id, next);
        return { ok: true, rev: next.rev };
      });
    },

    finishEvent(id) {
      return attempt(() => {
        const event = owned(id, requireUserId(backend));
        if (!event) throw new DataError('not_found', 'Event not found');
        backend.events.set(id, { ...event, status: 'finished', updatedAt: isoNow(backend) });
      });
    },

    claimDirector(id, sessionId, ttlSeconds = DEFAULT_DIRECTOR_TTL_SECONDS) {
      return attempt((): ClaimDirectorResult => {
        const userId = requireUserId(backend);
        // Mirrors claim_director(): same argument checks, same 'forbidden' for a foreign event.
        const session = sessionId.trim();
        if (session === '' || session.length > 200) throw new DataError('unknown', 'invalid_session');
        if (!Number.isFinite(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 3600) {
          throw new DataError('unknown', 'invalid_ttl');
        }
        if (!owned(id, userId)) throw new DataError('forbidden', 'event_not_found');
        const now = backend.now();
        const holder = backend.directors.get(id);
        if (holder !== undefined && holder.session !== session && holder.seenAt >= now - ttlSeconds * 1000) {
          return { ok: false, holderSeenAt: new Date(holder.seenAt).toISOString() };
        }
        backend.directors.set(id, { session, seenAt: now });
        return { ok: true };
      });
    },

    releaseDirector(id, sessionId) {
      return attempt(() => {
        const userId = requireUserId(backend);
        if (!owned(id, userId)) return;
        if (backend.directors.get(id)?.session === sessionId.trim()) backend.directors.delete(id);
      });
    },

    deleteEvent(id) {
      return attempt(() => {
        const userId = requireUserId(backend);
        if (!owned(id, userId)) return;
        backend.events.delete(id);
        backend.states.delete(id);
        backend.directors.delete(id);
        const room = [...backend.rooms.values()].find((r) => r.eventId === id);
        if (room) {
          backend.rooms.delete(room.code);
          for (const [key, member] of [...backend.members]) {
            if (member.roomCode === room.code) backend.members.delete(key);
          }
        }
      });
    },
  };
}
