import { Button, Panel } from '@/design';
import { money } from './format';
import styles from './Decision.module.css';

export interface MysteryDialogProps {
  teamName: string;
  /** The money earned on the Mystery wedge so far (what a flip gives up). */
  earned: number;
  /** Host buttons hide in show mode; the question stays on screen. */
  showButtons: boolean;
  onKeep: () => void;
  onFlip: () => void;
}

/** Mystery wedge: keep the money or give it up to flip the wedge (rules "The wheel"). */
export const MysteryDialog = ({ teamName, earned, showButtons, onKeep, onFlip }: MysteryDialogProps) => (
  <Panel className={styles.panel} role="dialog" aria-label="Mystery wedge" data-testid="mystery-dialog">
    <h2 className={styles.title}>MYSTERY WEDGE</h2>
    <p className={styles.text}>
      {teamName}: keep {money(earned)} or flip the wedge? One side hides $10,000, the other is BANKRUPT.
    </p>
    {showButtons ? (
      <div className={styles.actions}>
        <Button variant="confirm" size="lg" onClick={onKeep}>
          Keep {money(earned)} (K)
        </Button>
        <Button variant="danger" size="lg" onClick={onFlip}>
          Flip it (F)
        </Button>
      </div>
    ) : null}
  </Panel>
);
