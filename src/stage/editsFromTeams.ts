import type { Team, TeamEdit } from '@/engines/event';

/** What the team editor edits: names, colours and players (ids, scores and chips stay with the reducer). */
export const editsFromTeams = (teams: readonly Team[]): TeamEdit[] =>
  teams.map((t) => ({ name: t.name, color: t.color, players: [...t.players] }));
