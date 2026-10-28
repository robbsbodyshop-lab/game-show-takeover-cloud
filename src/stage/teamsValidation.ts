/** Team editor rules (FR-003): 2 to 8 teams, a unique non-empty name each, names short enough for phones. */
import { MAX_TEAMS, MIN_TEAMS, type TeamEdit } from '@/engines/event';

export const MAX_TEAM_NAME_LENGTH = 40;

export interface TeamsValidation {
  ok: boolean;
  /** Set when the number of teams is out of range. */
  countError: string | null;
  /** One entry per team, null when that name is fine. */
  nameErrors: (string | null)[];
}

export function validateTeamEdits(edits: readonly TeamEdit[]): TeamsValidation {
  const countError =
    edits.length < MIN_TEAMS || edits.length > MAX_TEAMS
      ? `A show needs ${String(MIN_TEAMS)} to ${String(MAX_TEAMS)} teams.`
      : null;
  const seen = new Map<string, number>();
  const nameErrors = edits.map((edit, index): string | null => {
    const name = edit.name.trim();
    if (name.length === 0) return 'Give this team a name.';
    if (name.length > MAX_TEAM_NAME_LENGTH) return `Use ${String(MAX_TEAM_NAME_LENGTH)} letters or fewer.`;
    const key = name.toLowerCase();
    if (seen.has(key)) return 'Another team already has this name.';
    seen.set(key, index);
    return null;
  });
  return { ok: countError === null && nameErrors.every((e) => e === null), countError, nameErrors };
}

/** Parses "Ann, Bob" into trimmed player names. */
export const parsePlayers = (text: string): string[] =>
  text
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
