import { VOWELS } from '@/engines/wheel/letters';
import { Button, Dialog } from '@/design';
import { money } from './format';
import styles from './VowelModal.module.css';

export const VOWEL_PRICE = 250;

export interface VowelModalProps {
  open: boolean;
  /** The team buying. */
  teamName: string;
  called: readonly string[];
  /** Vowels the engine accepts. */
  buyable: readonly string[];
  onPick: (letter: string) => void;
  onCancel: () => void;
}

/** Pick a vowel to buy for $250 (FR-024: the phone's BUY opens this on the stage for that team). */
export const VowelModal = ({ open, teamName, called, buyable, onPick, onCancel }: VowelModalProps) => (
  <Dialog open={open} onClose={onCancel} title={`${teamName}: BUY A VOWEL`} dismissOnBackdrop={false}>
    <p className={styles.price}>{money(VOWEL_PRICE)} from this round's cash</p>
    <div className={styles.row} role="group" aria-label="Vowels">
      {VOWELS.map((v) => (
        <Button
          key={v}
          size="lg"
          variant="tertiary"
          className={styles.vowel}
          disabled={called.includes(v) || !buyable.includes(v)}
          onClick={() => {
            onPick(v);
          }}
        >
          {v}
        </Button>
      ))}
    </div>
    <div className={styles.actions}>
      <Button variant="quiet" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  </Dialog>
);
