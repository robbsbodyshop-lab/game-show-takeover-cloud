import { Button, Label, Stripes } from '@/design';
import { leaders, type EventSession, type GamePhase } from '@/engines/event';
import { AbandonButton } from './AbandonButton';
import { shortJoinAddress } from './joinLink';
import { QrCanvas } from './QrCanvas';
import { ScoreRow } from './ScoreRow';
import styles from './Scoreboard.module.css';

export interface ScoreboardProps {
  session: EventSession;
  roomCode: string | null;
  origin: string;
  paused: boolean;
  musicOn: boolean;
  onScore: (team: number, delta: number) => void;
  onChips: (team: number, delta: number) => void;
  onTogglePause: () => void;
  onToggleMusic: () => void;
  onShowMode: () => void;
  onOpenSettings: () => void;
  /** Confirmed leave of a running game (the two taps are handled here). */
  onAbandon: () => void;
  /** One-tap back to the hub from a finale screen. */
  onBackToHub: () => void;
}

const GAME_PHASES: readonly GamePhase[] = ['feud', 'wheel'];
const BACKABLE_PHASES: readonly GamePhase[] = ['speed', 'plinko', 'puzzle', 'winner'];

/** FR-011: teams, scores, chips, room code and join link; host buttons hide with the sidebar in show mode. */
export const Scoreboard = ({
  session,
  roomCode,
  origin,
  paused,
  musicOn,
  onScore,
  onChips,
  onTogglePause,
  onToggleMusic,
  onShowMode,
  onOpenSettings,
  onAbandon,
  onBackToHub,
}: ScoreboardProps) => {
  const top = leaders(session);
  const anyPoints = session.teams.some((t) => t.score > 0);
  const inGame = GAME_PHASES.includes(session.phase);
  return (
    <aside className={styles.sidebar} aria-label="Scoreboard" data-testid="scoreboard">
      <Label className={styles.title}>Scoreboard</Label>
      <Stripes />
      <ul className={styles.rows}>
        {session.teams.map((team) => (
          <ScoreRow
            key={team.id}
            team={team}
            leader={anyPoints && top.some((t) => t.id === team.id)}
            onScore={onScore}
            onChips={onChips}
          />
        ))}
      </ul>
      <div className={styles.join}>
        <div className={styles.joinText}>
          <Label>Join</Label>
          <span className={styles.code} aria-label="Room code">
            {roomCode ?? '----'}
          </span>
          <span className={styles.link}>
            {shortJoinAddress(origin)}
            {roomCode ? ` (room ${roomCode})` : ''}
          </span>
        </div>
        {roomCode ? (
          <div className={styles.joinQr}>
            <QrCanvas value={`${origin}/play?room=${roomCode}`} size={120} />
          </div>
        ) : null}
      </div>
      <div className={styles.buttons}>
        <Button size="sm" variant="host" onClick={onTogglePause}>
          {paused ? 'Resume' : 'Pause'}
        </Button>
        <Button size="sm" variant="host" onClick={onToggleMusic} aria-pressed={musicOn}>
          {musicOn ? 'Music on' : 'Music off'}
        </Button>
        <Button size="sm" variant="host" onClick={onShowMode}>
          Show mode
        </Button>
        <Button size="sm" variant="host" onClick={onOpenSettings}>
          Settings
        </Button>
        {inGame ? <AbandonButton onConfirm={onAbandon} className={styles.wide} /> : null}
        {BACKABLE_PHASES.includes(session.phase) ? (
          <Button size="sm" variant="secondary" className={styles.wide} onClick={onBackToHub}>
            Back to hub
          </Button>
        ) : null}
      </div>
    </aside>
  );
};
