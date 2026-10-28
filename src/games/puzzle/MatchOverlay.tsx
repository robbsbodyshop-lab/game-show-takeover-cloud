import { Button, Panel } from '@/design';
import { ROUNDS_TO_WIN } from '@/engines/puzzle';
import type { PuzzleController, PuzzleSnapshot } from './controller';
import styles from './MatchOverlay.module.css';
import { SpriteIcon } from './SpriteIcon';

export interface MatchOverlayProps {
  controller: PuzzleController;
  snapshot: PuzzleSnapshot;
  showHints: boolean;
}

const playerName = (index: number | null): string =>
  index === null ? '' : `Player ${(index + 1).toString()}`;

/** Pause, round-over and match-over panels drawn over the board. */
export const MatchOverlay = ({ controller, snapshot, showHints }: MatchOverlayProps) => {
  const { overlay, match, holdDone } = snapshot;
  if (overlay === 'none') return null;

  if (overlay === 'paused') {
    return (
      <div className={styles.scrim} data-testid="overlay-paused">
        <Panel className={styles.panel} role="status" aria-label="Paused">
          <h2 className={styles.title}>Paused</h2>
          <div className={styles.buttons}>
            <Button
              variant="primary"
              tabIndex={-1}
              onClick={() => {
                controller.resume();
              }}
            >
              Resume
            </Button>
            <Button
              variant="tertiary"
              tabIndex={-1}
              onClick={() => {
                controller.quitToTitle();
              }}
            >
              Quit to title
            </Button>
          </div>
          {showHints ? <p className={styles.hint}>P or Esc resumes. Q quits to the title.</p> : null}
        </Panel>
      </div>
    );
  }

  const solo = match.mode === '1p';
  const isMatchOver = overlay === 'match-over';
  const winner = isMatchOver ? match.matchWinner : match.roundWinner;
  const first = match.players[0];
  let heading: string;
  let detail: string;
  if (solo && isMatchOver) {
    heading = 'Game over';
    detail = `Level ${(first?.level ?? 1).toString()}, score ${(first?.score ?? 0).toString()}`;
  } else if (solo) {
    heading = `Level ${(first?.level ?? 1).toString()} clear`;
    detail = `Score ${(first?.score ?? 0).toString()}. Next: level ${Math.min(20, (first?.level ?? 1) + 1).toString()}`;
  } else if (isMatchOver) {
    heading = `${playerName(winner)} wins the match`;
    detail = `${(match.roundWins[0] ?? 0).toString()} - ${(match.roundWins[1] ?? 0).toString()} in rounds`;
  } else {
    heading = `${playerName(winner)} wins round ${match.round.toString()}`;
    detail = `Rounds ${(match.roundWins[0] ?? 0).toString()} - ${(match.roundWins[1] ?? 0).toString()}, first to ${ROUNDS_TO_WIN.toString()}`;
  }
  const crowned = winner !== null;

  return (
    <div className={styles.scrim} data-testid={`overlay-${overlay}`}>
      <Panel className={styles.panel} role="status" aria-live="polite">
        {crowned ? <SpriteIcon id="crown" scale={6} className={styles.crown} /> : null}
        <h2 className={styles.title}>{heading}</h2>
        <p className={styles.detail}>{detail}</p>
        <div className={styles.buttons}>
          <Button
            variant="primary"
            disabled={!holdDone}
            tabIndex={-1}
            data-testid="press-start"
            onClick={() => {
              controller.pressStart();
            }}
          >
            Press Start
          </Button>
          {isMatchOver ? (
            <Button
              variant="tertiary"
              tabIndex={-1}
              onClick={() => {
                controller.quitToTitle();
              }}
            >
              Title
            </Button>
          ) : null}
        </div>
        {showHints ? (
          <p className={styles.hint}>
            {holdDone ? 'Enter or Space to continue. Esc for the title.' : 'Get ready...'}
          </p>
        ) : null}
      </Panel>
    </div>
  );
};
