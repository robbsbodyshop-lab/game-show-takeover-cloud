import type { WheelActionType } from '@/engines/wheel/types';
import { Button } from '@/design';
import styles from './WheelHostBar.module.css';

export interface WheelHostBarProps {
  legal: readonly WheelActionType[];
  continueLabel: string | null;
  /** The game is over: Continue reports the result. */
  gameOver: boolean;
  canLateSolve: boolean;
  run: (name: string, args?: Record<string, unknown>) => void;
  onPause: () => void;
}

const has = (legal: readonly WheelActionType[], ...types: WheelActionType[]): boolean =>
  types.some((t) => legal.includes(t));

/** The host's buttons on the stage (hidden in show mode; every one has a key). Same commands as the console. */
export const WheelHostBar = ({
  legal,
  continueLabel,
  gameOver,
  canLateSolve,
  run,
  onPause,
}: WheelHostBarProps) => (
  <div className={styles.bar} role="toolbar" aria-label="Host controls" data-testid="wheel-host-bar">
    <Button variant="quiet" size="sm" onClick={onPause}>
      Pause
    </Button>
    <Button
      variant="primary"
      disabled={!has(legal, 'SPIN', 'SPEEDUP_SPIN', 'BONUS_SPIN')}
      onClick={() => {
        run('spin');
      }}
    >
      Spin (Space)
    </Button>
    <Button
      variant="host"
      disabled={!has(legal, 'BUY_VOWEL')}
      onClick={() => {
        run('open-vowel-pick');
      }}
    >
      Buy vowel (Shift+B)
    </Button>
    <Button
      variant="secondary"
      disabled={!has(legal, 'SOLVE_START') && !canLateSolve}
      onClick={() => {
        run('solve-start');
      }}
    >
      Solve (Enter)
    </Button>
    {continueLabel ? (
      <Button
        variant="confirm"
        disabled={!gameOver && !has(legal, 'CONTINUE')}
        onClick={() => {
          run('continue');
        }}
      >
        {continueLabel} (Enter)
      </Button>
    ) : null}
    <Button
      variant="tertiary"
      disabled={!has(legal, 'RING_BELL')}
      onClick={() => {
        run('ring-bell');
      }}
    >
      Time bell (Shift+T)
    </Button>
    <Button
      variant="quiet"
      disabled={!has(legal, 'UNDO')}
      onClick={() => {
        run('undo');
      }}
    >
      Undo (Shift+U)
    </Button>
  </div>
);
