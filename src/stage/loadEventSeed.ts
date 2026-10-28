/**
 * Picks the starting state for an opened event (FR-004, FR-005): the cloud copy and the browser
 * cache are both validated with `parseSession`; the higher revision wins.
 *
 * Tie-break: at the same revision a cache entry that is NOT synced holds local edits made on top of
 * that very cloud copy (nobody saved in between, or the revision would be higher), for example while
 * offline, so it wins; otherwise the cloud copy (which a synced cache equals) is used.
 */
import { loadCached, type CachedState, type DataLayer, type EventRecord } from '@/data';
import { createEventSession, parseSession, type EventSession } from '@/engines/event';
import { logger } from '@/lib/logger';

export interface SeedCandidate {
  rev: number;
  session: EventSession;
}

export interface CachedCandidate extends SeedCandidate {
  synced: boolean;
}

export function chooseSeed(
  cloud: SeedCandidate | null,
  cached: CachedCandidate | null,
): { session: EventSession; source: 'cloud' | 'cache' } | null {
  if (cloud && cached) {
    const cacheWins = cached.rev > cloud.rev || (cached.rev === cloud.rev && !cached.synced);
    return cacheWins
      ? { session: cached.session, source: 'cache' }
      : { session: cloud.session, source: 'cloud' };
  }
  if (cloud) return { session: cloud.session, source: 'cloud' };
  if (cached) return { session: cached.session, source: 'cache' };
  return null;
}

export interface LoadedEvent {
  event: EventRecord;
  /** The session to start from (a fresh two-team session for a new event). */
  session: EventSession;
  /** The revision the cloud copy has now; the first save must expect exactly this. */
  rev: number;
  /** True when a saved session was found (so the host is offered Resume / Start a new event). */
  hasSavedState: boolean;
  /** True when the chosen state came from the cache and the cloud has not caught up yet. */
  unsynced: boolean;
  notice: string | null;
}

export async function loadEventSeed(
  data: DataLayer,
  eventId: string,
  readCache: (id: string) => CachedState | null = loadCached,
): Promise<LoadedEvent | null> {
  const [event, record] = await Promise.all([data.events.getEvent(eventId), data.events.loadState(eventId)]);
  if (!event) return null;

  const cloudRaw = record?.state ?? null;
  const cloudSession = cloudRaw === null ? null : parseSession(cloudRaw);
  const cachedRaw = readCache(eventId);
  const cachedSession = cachedRaw ? parseSession(cachedRaw.state) : null;

  let notice: string | null = null;
  if (cloudRaw !== null && cloudSession === null) {
    logger.warn('[stage] the saved copy of this event could not be read');
    notice = 'The saved copy of this event could not be read, so it was not loaded.';
  }

  const chosen = chooseSeed(
    cloudSession && record ? { rev: record.rev, session: cloudSession } : null,
    cachedRaw && cachedSession
      ? { rev: cachedRaw.rev, session: cachedSession, synced: cachedRaw.synced }
      : null,
  );
  const rev = record?.rev ?? 0;
  return {
    event,
    session: chosen?.session ?? createEventSession(),
    rev,
    hasSavedState: chosen !== null,
    unsynced: chosen?.source === 'cache' && cachedRaw?.synced === false,
    notice,
  };
}
