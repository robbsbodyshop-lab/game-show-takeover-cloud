import type { CSSProperties } from 'react';
import { currentMatch } from '@/engines/event/tournament';
import type { BracketMatch, BracketState, Team } from '@/engines/event/types';
import styles from './TournamentBracket.module.css';

export interface TournamentBracketProps {
  bracket: BracketState;
  teams: readonly Pick<Team, 'id' | 'name' | 'color'>[];
}

const roundName = (index: number, total: number): string => {
  if (index === total - 1) return 'FINAL';
  if (index === total - 2 && total > 2) return 'SEMIFINALS';
  return `ROUND ${(index + 1).toString()}`;
};

/** Single-elimination bracket with the match being played now outlined (FR-032). */
export const TournamentBracket = ({ bracket, teams }: TournamentBracketProps) => {
  const current = currentMatch(bracket);
  const lookup = (id: number | null): Pick<Team, 'id' | 'name' | 'color'> | null =>
    id === null ? null : (teams.find((team) => team.id === id) ?? null);

  const line = (match: BracketMatch, id: number | null) => {
    const team = lookup(id);
    return (
      <li
        className={styles.team}
        style={{ '--team': team?.color ?? 'transparent' } as CSSProperties}
        data-winner={match.winner !== null && match.winner === id ? 'true' : 'false'}
        data-out={match.winner !== null && id !== null && match.winner !== id ? 'true' : 'false'}
      >
        <span className={styles.chip} />
        <span className={styles.name}>{team?.name ?? (match.bye && id === null ? 'BYE' : 'TBD')}</span>
      </li>
    );
  };

  return (
    <div className={styles.bracket} role="group" aria-label="Tournament bracket">
      {bracket.rounds.map((round, roundIndex) => (
        <div key={roundIndex} className={styles.round}>
          <h3 className={styles.roundName}>{roundName(roundIndex, bracket.rounds.length)}</h3>
          <div className={styles.matches}>
            {round.map((match) => (
              <ul
                key={`${match.round.toString()}-${match.slot.toString()}`}
                className={styles.match}
                aria-current={
                  current !== null && current.round === match.round && current.slot === match.slot
                    ? 'true'
                    : undefined
                }
              >
                {line(match, match.a)}
                {line(match, match.b)}
              </ul>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
