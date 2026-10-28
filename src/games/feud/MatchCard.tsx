import type { CSSProperties } from 'react';
import { Marquee } from '@/design/Marquee';
import { Panel } from '@/design/Panel';
import type { BracketState, Team } from '@/engines/event/types';
import { TournamentBracket } from './TournamentBracket';
import type { FeudViewModel } from './types';
import styles from './MatchCard.module.css';

export interface MatchCardProps {
  view: FeudViewModel;
  /** All teams of the event, for the bracket. */
  teams: readonly Team[];
  bracket: BracketState | null;
}

/** First screen of a match: the two families, the target and, in a bracket, the bracket (FR-032). */
export const MatchCard = ({ view, teams, bracket }: MatchCardProps) => {
  const { settings } = view;
  const oneRound = settings.format === 'one-round';
  return (
    <Panel className={styles.card}>
      <Marquee as="h1">{view.matchLabel ?? 'Family Feud'}</Marquee>
      <div className={styles.versus}>
        {(['A', 'B'] as const).map((side, index) => (
          <div
            key={side}
            className={styles.family}
            style={{ '--team': view.teams[side].color } as CSSProperties}
          >
            <span className={styles.band} />
            <span className={styles.name}>{view.teams[side].name}</span>
            {index === 0 && <span className={styles.vs}>VS</span>}
          </div>
        ))}
      </div>
      <p className={styles.rule}>
        {oneRound
          ? 'One round: the family that wins the round wins the match'
          : `First family to ${view.targetScore.toString()} points wins`}
      </p>
      {settings.fastMoneyEnabled && <p className={styles.note}>The winners play Fast Money for 200 points</p>}
      {bracket !== null && teams.length > 2 && <TournamentBracket bracket={bracket} teams={teams} />}
    </Panel>
  );
};
