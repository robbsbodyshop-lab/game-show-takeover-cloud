import { CONSONANTS, VOWELS } from '@/engines/wheel/letters';
import { cx } from '@/design/cx';
import styles from './LetterKeyboard.module.css';

export interface LetterKeyboardProps {
  /** Letters already called this puzzle (hits and misses): shown struck and disabled. */
  called: readonly string[];
  /** Letters the engine accepts as a consonant call (or a Bonus call) right now. */
  callable: readonly string[];
  /** Vowels the engine would let the team buy right now. */
  buyable: readonly string[];
  onLetter: (letter: string) => void;
  /** Dim everything, for example while the wheel turns or the game is paused. */
  disabled?: boolean;
  className?: string;
}

/**
 * The 26 letters, consonants and vowels apart (FR-040): a letter is pressable only when the engine
 * accepts it now, a called letter is disabled. The host or the stage input clicks; hotkeys do the same.
 */
export const LetterKeyboard = ({
  called,
  callable,
  buyable,
  onLetter,
  disabled = false,
  className,
}: LetterKeyboardProps) => {
  const key = (letter: string, vowel: boolean) => {
    const isCalled = called.includes(letter);
    const legal = vowel ? buyable.includes(letter) : callable.includes(letter);
    return (
      <button
        key={letter}
        type="button"
        className={styles.key}
        data-called={isCalled}
        data-vowel={vowel}
        disabled={disabled || isCalled || !legal}
        aria-label={vowel ? `Buy ${letter}` : `Call ${letter}`}
        onClick={() => {
          onLetter(letter);
        }}
      >
        {letter}
      </button>
    );
  };
  return (
    <div className={cx(styles.keyboard, className)} data-testid="letter-keyboard">
      <div className={styles.group} role="group" aria-label="Consonants">
        {CONSONANTS.map((l) => key(l, false))}
      </div>
      <div className={styles.group} role="group" aria-label="Vowels" data-vowels="true">
        {VOWELS.map((l) => key(l, true))}
      </div>
    </div>
  );
};
