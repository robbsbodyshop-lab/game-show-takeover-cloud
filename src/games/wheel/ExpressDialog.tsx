import { Button, Panel } from '@/design';
import styles from './Decision.module.css';

export interface ExpressDialogProps {
  teamName: string;
  showButtons: boolean;
  onPlay: () => void;
  onPass: () => void;
}

/** Express wedge: ride it (consonants at $1,000, any miss is Bankrupt) or pass (rules "The wheel"). */
export const ExpressDialog = ({ teamName, showButtons, onPlay, onPass }: ExpressDialogProps) => (
  <Panel className={styles.panel} role="dialog" aria-label="Express wedge" data-testid="express-dialog">
    <h2 className={styles.title}>THE EXPRESS</h2>
    <p className={styles.text}>
      {teamName}: ride the Express? Consonants pay $1,000 with no spin, but any miss, repeat or wrong solve is
      a BANKRUPT.
    </p>
    {showButtons ? (
      <div className={styles.actions}>
        <Button variant="primary" size="lg" onClick={onPlay}>
          Ride the Express (R)
        </Button>
        <Button variant="quiet" size="lg" onClick={onPass}>
          Pass (P)
        </Button>
      </div>
    ) : null}
  </Panel>
);
