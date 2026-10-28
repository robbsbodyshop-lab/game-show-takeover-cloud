/** Which two teams play this Feud game, from what the stage passes (match, bracket or play order). */
import { currentMatch } from '@/engines/event/tournament';
import type { BracketState, Team } from '@/engines/event/types';
import type { FeudMatch } from './FeudController';

export interface MatchSources {
  teams: readonly Team[];
  playOrder: readonly number[] | null;
  match?: FeudMatch | undefined;
  bracket?: BracketState | null | undefined;
}

export const resolveMatch = ({ teams, playOrder, match, bracket }: MatchSources): FeudMatch => {
  if (match !== undefined) return match;
  const fromBracket = bracket ? currentMatch(bracket) : null;
  if (bracket && fromBracket?.a != null && fromBracket.b != null) {
    const real = bracket.rounds.flat().filter((m) => !m.bye);
    const decided = real.filter((m) => m.winner !== null).length;
    return { a: fromBracket.a, b: fromBracket.b, number: decided + 1, of: real.length };
  }
  const [first, second] = playOrder ?? teams.map((team) => team.id);
  const [fallbackA, fallbackB] = teams.map((team) => team.id);
  return { a: first ?? fallbackA ?? 1, b: second ?? fallbackB ?? 2 };
};
