import { useState } from 'react';
import { Button } from '@/design';
import type { TeamSummary } from '@/data/types';
import { BuzzScreen } from './BuzzScreen';
import { PhoneFooter } from './PhoneFooter';
import { PhoneHeader } from './PhoneHeader';
import { PodiumScreen } from './PodiumScreen';
import { StatusPanel } from './StatusPanel';
import { hasPodiumActions } from './phoneControls';
import { useStageLink } from './useStageLink';
import styles from './PlayScreen.module.css';

export interface PlayScreenProps {
  code: string;
  team: number;
  teams: readonly TeamSummary[];
  nickname: string;
  userId: string;
  onTeams: (teams: TeamSummary[]) => void;
  onGiveUp: () => void;
  onChangeTeam: () => void;
  onChangeRoom: () => void;
}

/**
 * The connected phone: header, the buzz or podium screen (or a connection message) and the footer.
 * Mount with `key={code + team}` so every room/team starts a fresh connection.
 */
export const PlayScreen = ({
  code,
  team,
  teams,
  nickname,
  userId,
  onTeams,
  onGiveUp,
  onChangeTeam,
  onChangeRoom,
}: PlayScreenProps) => {
  const link = useStageLink({ code, team, userId, nickname, onTeams, onGiveUp });
  const [solveOpen, setSolveOpen] = useState(false);

  const me = teams.find((t) => t.id === team);
  const teamName = me?.name ?? `Team ${String(team)}`;
  const teamColor = me?.color ?? 'var(--c-mist)';
  const { controls, status } = link;
  const connected = status === 'connected';
  const myTurn = controls?.activeTeam === team;

  // The turn moved on while the box was open: drop it quietly (nothing left to cancel).
  if (solveOpen && !myTurn) setSolveOpen(false);
  const solving = solveOpen && myTurn;

  const leave = (then: () => void) => () => {
    if (solving) link.sendAction('solve-cancel');
    then();
  };

  let body;
  if (status === 'error' || status === 'offline') {
    body = (
      <StatusPanel title="Not connected" detail="Could not reach the game. Check your connection.">
        <Button size="lg" onClick={link.retry}>
          Try again
        </Button>
      </StatusPanel>
    );
  } else if (status === 'connecting') {
    body = <StatusPanel title="Connecting…" spinner />;
  } else if (link.waiting) {
    body = (
      <StatusPanel
        title="Waiting for the game screen…"
        detail="Hang on, you will rejoin by yourself."
        spinner
      />
    );
  } else if (!link.stageSeen) {
    body = <StatusPanel title="Joining the game…" spinner />;
  } else if (controls !== null && (hasPodiumActions(controls, team) || solving)) {
    body = (
      <PodiumScreen
        controls={controls}
        connected={connected}
        solving={solving}
        note={link.note}
        onBuy={() => {
          link.sendAction('buy');
        }}
        onSpin={() => {
          link.sendAction('spin');
        }}
        onSolveStart={() => {
          setSolveOpen(true);
          link.sendAction('solve-start');
        }}
        onSolveCancel={() => {
          setSolveOpen(false);
          link.sendAction('solve-cancel');
        }}
        onSolveSubmit={(answer) => {
          setSolveOpen(false);
          link.sendAction('solve', answer);
        }}
      />
    );
  } else {
    body = (
      <BuzzScreen
        controls={controls}
        team={team}
        color={teamColor}
        connected={connected}
        feedback={link.buzz}
        onBuzz={link.press}
        onFeudAnswer={link.sendFeudAnswer}
      />
    );
  }

  const centered = status !== 'connected' || link.waiting || !link.stageSeen;

  return (
    <div className={styles.screen}>
      <PhoneHeader teamName={teamName} teamColor={teamColor} code={code} status={status} />
      {status === 'reconnecting' ? (
        <div role="status" className={styles.banner}>
          Reconnecting…
        </div>
      ) : null}
      <main className={centered ? `${styles.main} ${styles.centered}` : styles.main}>{body}</main>
      <PhoneFooter onChangeTeam={leave(onChangeTeam)} onChangeRoom={leave(onChangeRoom)} />
    </div>
  );
};
