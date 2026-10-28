/**
 * Family Feud on the stage (design.md section 8.1). Renders the audience view of the controller and
 * dispatches host actions through it; it never computes a rule and never receives hidden answers.
 */
import { useCallback } from 'react';
import { ControlPanel } from './ControlPanel';
import { FaceOffPanel } from './FaceOffPanel';
import { FamilyScoreBox } from './FamilyScoreBox';
import { FastMoney } from './FastMoney';
import { FeudBoard } from './FeudBoard';
import type { FeudGameProps, RunCommand } from './FeudGame.types';
import { FeudHeader } from './FeudHeader';
import { GameOverCard } from './GameOverCard';
import { GameWonCard } from './GameWonCard';
import { HostBar } from './HostBar';
import { MatchCard } from './MatchCard';
import { podiumName } from './labels';
import { RoundIntro } from './RoundIntro';
import { RoundSummary } from './RoundSummary';
import { StealPanel } from './StealPanel';
import { StrikeOverlay } from './StrikeOverlay';
import { SuddenDeathCard } from './SuddenDeathCard';
import { useFeudController } from './useFeudController';
import { useFeudHotkeys } from './useFeudHotkeys';
import type { FeudViewModel } from './types';
import styles from './FeudGame.module.css';

const BOARD_PHASES = [
  'face-off',
  'play-or-pass',
  'control',
  'steal-confer',
  'steal-answer',
  'round-decided',
  'round-summary',
] as const;

interface BoardScreenProps {
  view: FeudViewModel;
  showMode: boolean;
  onCommand: RunCommand;
}

const BoardScreen = ({ view, showMode, onCommand }: BoardScreenProps) => {
  const { audience, teams } = view;
  const answering = audience.answering;
  const answeringName = (side: 'A' | 'B'): string | null =>
    answering !== null && answering.side === side ? podiumName(view, side, answering.playerIndex) : null;

  let panel;
  switch (audience.phase) {
    case 'control':
      panel = <ControlPanel view={view} showMode={showMode} onCommand={onCommand} />;
      break;
    case 'steal-confer':
    case 'steal-answer':
      panel = <StealPanel view={view} showMode={showMode} onCommand={onCommand} />;
      break;
    case 'round-decided':
    case 'round-summary':
      panel = <RoundSummary view={view} />;
      break;
    default:
      panel = <FaceOffPanel view={view} showMode={showMode} onCommand={onCommand} />;
  }

  return (
    <>
      <FeudHeader view={view} />
      <div className={styles.main}>
        <FamilyScoreBox
          team={teams.A}
          score={audience.families.A.score}
          inControl={audience.control === 'A'}
          strikes={audience.control === 'A' ? audience.strikes : 0}
          answeringName={answeringName('A')}
          stealing={audience.stealing === 'A'}
        />
        <div className={styles.center}>
          <FeudBoard slots={audience.board} />
          {view.surveySays && (
            <p className={styles.surveySays} role="status">
              SURVEY SAYS...
            </p>
          )}
          {view.reviewPending && (
            <p className={styles.surveySays} role="status">
              CHECKING THE BOARD...
            </p>
          )}
        </div>
        <FamilyScoreBox
          team={teams.B}
          score={audience.families.B.score}
          inControl={audience.control === 'B'}
          strikes={audience.control === 'B' ? audience.strikes : 0}
          answeringName={answeringName('B')}
          stealing={audience.stealing === 'B'}
        />
      </div>
      <div className={styles.panel}>{panel}</div>
    </>
  );
};

/** The Family Feud game component the stage mounts for a match. */
export const FeudGame = (props: FeudGameProps) => {
  const { controller, view } = useFeudController(props);
  const onCommand = useCallback<RunCommand>(
    (name, args) => {
      controller.run(name, args ?? {});
    },
    [controller],
  );
  useFeudHotkeys(controller, !props.inputLocked);

  const phase = view.audience.phase;
  const onBoard = (BOARD_PHASES as readonly string[]).includes(phase);
  let screen;
  switch (phase) {
    case 'pre-game':
      screen = <MatchCard view={view} teams={props.teams} bracket={props.bracket ?? null} />;
      break;
    case 'round-intro':
      screen = <RoundIntro view={view} />;
      break;
    case 'sudden-death':
      screen = <SuddenDeathCard view={view} />;
      break;
    case 'game-won':
      screen = <GameWonCard view={view} />;
      break;
    case 'fast-money':
      screen = <FastMoney view={view} />;
      break;
    case 'game-over':
      screen = <GameOverCard view={view} />;
      break;
    default:
      screen = onBoard ? <BoardScreen view={view} showMode={props.showMode} onCommand={onCommand} /> : null;
  }

  return (
    <div className={styles.root} data-phase={phase} data-testid="feud-game">
      {screen}
      <div className={styles.hostRow}>
        <HostBar view={view} showMode={props.showMode} onCommand={onCommand} />
      </div>
      {view.overlay !== null && <StrikeOverlay id={view.overlay.id} count={view.overlay.count} />}
    </div>
  );
};
