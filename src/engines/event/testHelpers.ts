/** Shared helpers for the event engine tests. */
import { createEventSession, defaultTeamEdits, eventReducer } from './eventReducer';
import type { EventAction, EventSession, TeamEdit } from './types';

export function run(state: EventSession, ...actions: EventAction[]): EventSession {
  return actions.reduce(eventReducer, state);
}

export function session(teamCount: number, edits?: TeamEdit[]): EventSession {
  return createEventSession(edits ?? defaultTeamEdits(teamCount));
}

/** A session in the hub with `teamCount` teams (doors skipped via SET_PLAY_ORDER for 3+). */
export function hubSession(teamCount: number): EventSession {
  const s = session(teamCount);
  const order = s.teams.map((t) => t.id);
  return run(s, { type: 'SET_PLAY_ORDER', order }, { type: 'GO_HUB' });
}

export const DRAW_8 = [0.1, 0.9, 0.2, 0.8, 0.3, 0.7, 0.4, 0.6];

export function teamScore(s: EventSession, id: number): number {
  return s.teams.find((t) => t.id === id)?.score ?? Number.NaN;
}

export function teamChips(s: EventSession, id: number): number {
  return s.teams.find((t) => t.id === id)?.chips ?? Number.NaN;
}
