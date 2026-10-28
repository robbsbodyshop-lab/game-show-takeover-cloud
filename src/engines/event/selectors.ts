/** Read-only views of an EventSession. No hidden information lives in the event wrapper. */
import { PLINKO_SLOT_COUNT } from './plinko';
import { speedRemainingMs } from './speed';
import { createBracket, currentMatch } from './tournament';
import type { EventSession, Team } from './types';

export function teamById(s: EventSession, id: number): Team | undefined {
  return s.teams.find((t) => t.id === id);
}

/** Teams first player first. Falls back to list order until the doors or the host decide. */
export function teamsInPlayOrder(s: EventSession): Team[] {
  if (!s.playOrder) return [...s.teams];
  const ordered = s.playOrder.map((id) => teamById(s, id)).filter((t): t is Team => t !== undefined);
  return ordered.length === s.teams.length ? ordered : [...s.teams];
}

/** True while a main game is on the stage (its engine snapshot is being kept in the session). */
export function isGamePlaying(s: EventSession): boolean {
  return s.game !== null;
}

/** Edit Teams is only offered at setup, doors and the hub (not while any game phase runs). */
export function canEditTeams(s: EventSession): boolean {
  return s.phase === 'setup' || s.phase === 'doors' || s.phase === 'hub';
}

export interface Standing {
  team: Team;
  /** Competition rank: 1, 1, 3 for a tie on top. Only score decides. */
  rank: number;
}

/** Highest score first; equal scores share a rank and keep list order. */
export function standings(s: EventSession): Standing[] {
  const sorted = [...s.teams].sort((a, b) => b.score - a.score || a.id - b.id);
  return sorted.map((team) => {
    const firstEqual = sorted.findIndex((t) => t.score === team.score);
    return { team, rank: firstEqual + 1 };
  });
}

/** Every team sharing the top score. */
export function leaders(s: EventSession): Team[] {
  return standings(s)
    .filter((x) => x.rank === 1)
    .map((x) => x.team);
}

/** The champion, or null when there are no teams or the top score is tied. */
export function winnerTeam(s: EventSession): Team | null {
  const top = leaders(s);
  return top.length === 1 ? (top[0] ?? null) : null;
}

export interface NextMatch {
  round: number;
  slot: number;
  a: Team;
  b: Team;
}

/**
 * The Family Feud match to play next: the bracket's current match, a preview of the first match
 * before the bracket exists, or the two teams of a two-team event. Null when Feud is done.
 */
export function nextBracketMatch(s: EventSession): NextMatch | null {
  if (!s.availableMainGames.includes('feud')) return null;
  const build = (round: number, slot: number, aId: number | null, bId: number | null): NextMatch | null => {
    const a = aId === null ? undefined : teamById(s, aId);
    const b = bId === null ? undefined : teamById(s, bId);
    return a && b ? { round, slot, a, b } : null;
  };
  if (s.teams.length < 3) {
    const [a, b] = s.teams;
    return a && b ? { round: 0, slot: 0, a, b } : null;
  }
  const bracket = s.bracket ?? createBracket(s.playOrder ?? s.teams.map((t) => t.id));
  const m = currentMatch(bracket);
  return m ? build(m.round, m.slot, m.a, m.b) : null;
}

export function plinkoChipsRemaining(s: EventSession): number {
  return s.teams.reduce((sum, t) => sum + t.chips, 0);
}

/** True when the Plinko finale has nothing left to drop. */
export function plinkoFinished(s: EventSession): boolean {
  return s.phase === 'plinko' && plinkoChipsRemaining(s) === 0;
}

export const PLINKO_COLUMNS = PLINKO_SLOT_COUNT;

export function speedClockMs(s: EventSession, now: number): number | null {
  return s.speed ? speedRemainingMs(s.speed, now) : null;
}
