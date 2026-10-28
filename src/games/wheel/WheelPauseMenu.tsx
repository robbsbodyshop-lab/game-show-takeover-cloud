import { Button, Dialog } from '@/design';
import { useTwoTap } from '@/host/useTwoTap';
import styles from './WheelPauseMenu.module.css';

export interface WheelPauseMenuProps {
  open: boolean;
  /** RESTART ROUND is offered only when a puzzle can be thrown out (turn and money stay). */
  canRestart: boolean;
  onResume: () => void;
  onRestart: () => void;
  onOptions: () => void;
  /** The confirmed quit: the second tap within 4 s. */
  onQuit: () => void;
}

/** The Wheel's own pause menu (inventory 2.2): RESUME, RESTART ROUND, OPTIONS and a two-tap QUIT TO HUB. */
export const WheelPauseMenu = ({
  open,
  canRestart,
  onResume,
  onRestart,
  onOptions,
  onQuit,
}: WheelPauseMenuProps) => {
  const quit = useTwoTap(onQuit);
  return (
    <Dialog open={open} onClose={onResume} title="PAUSED" dismissOnBackdrop={false} className={styles.menu}>
      <div className={styles.list}>
        <Button size="lg" variant="confirm" onClick={onResume}>
          Resume
        </Button>
        <Button size="lg" variant="secondary" disabled={!canRestart} onClick={onRestart}>
          Restart round
        </Button>
        <Button size="lg" variant="tertiary" onClick={onOptions}>
          Options
        </Button>
        <Button size="lg" variant="danger" onClick={quit.press}>
          {quit.armed ? 'Tap again: abandon (no scores)' : 'Quit to hub'}
        </Button>
      </div>
    </Dialog>
  );
};
