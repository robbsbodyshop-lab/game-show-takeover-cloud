/**
 * Plain, serialisable records returned by the data layer. Dates are ISO-8601 strings so records can
 * be stored, cloned and compared without surprises. Spec: design.md sections 4 and 7.
 */

export type EventStatus = 'setup' | 'live' | 'finished';

export interface EventRecord {
  id: string;
  ownerId: string;
  name: string;
  status: EventStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * The saved copy of an event. `state` is opaque here: the event reducer (engines/event) owns the
 * schema and validates it on load. It is `null` until the first save.
 */
export interface EventStateRecord {
  eventId: string;
  rev: number;
  state: unknown;
  savedAt: string;
}

export type SaveStateResult = { ok: true; rev: number } | { ok: false; reason: 'conflict' };

/** Per-host settings groups (design.md section 4: feud, wheel, app). Each group is a JSON object. */
export type SettingsGroup = Record<string, unknown>;

export interface HostSettingsRecord {
  feud: SettingsGroup;
  wheel: SettingsGroup;
  app: SettingsGroup;
}

/** What a phone may know about a team (design.md section 4: id, name, color only). */
export interface TeamSummary {
  id: number;
  name: string;
  color: string;
}

export interface RoomInfo {
  code: string;
  eventId: string;
  teams: TeamSummary[];
}

export type JoinRoomResult =
  { ok: true; room: RoomInfo } | { ok: false; reason: 'not_found' | 'rate_limited' };

export interface AuthUser {
  id: string;
  email: string | null;
  isAnonymous: boolean;
}

export interface AuthSession {
  user: AuthUser;
  /** Unix seconds, or null when unknown. */
  expiresAt: number | null;
}

/** Sign-in style calls never throw for expected failures (bad password, user exists). */
export type AuthResult = { ok: true; session: AuthSession | null } | { ok: false; message: string };
