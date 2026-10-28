import { Button, Panel } from '@/design';
import styles from './Decision.module.css';

export interface WildCardPromptProps {
  teamName: string;
  showButtons: boolean;
  onPlay: () => void;
}

/** After a correct consonant on a dollar value the holder may play the Wild Card for one more consonant. */
export const WildCardPrompt = ({ teamName, showButtons, onPlay }: WildCardPromptProps) => (
  <Panel className={styles.strip} role="group" aria-label="Wild Card" data-testid="wild-card-prompt">
    <span className={styles.text}>{teamName} holds the WILD CARD: one more consonant at the same value.</span>
    {showButtons ? (
      <Button variant="host" onClick={onPlay}>
        Play the Wild Card
      </Button>
    ) : null}
  </Panel>
);
