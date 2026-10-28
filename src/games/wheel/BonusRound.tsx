import type { AudienceView } from '@/engines/wheel/selectors';
import { isVowel } from '@/engines/wheel/letters';
import { Button, Panel } from '@/design';
import { BonusWheel } from './BonusWheel';
import { ClockBar } from './ClockBar';
import type { ClockSnapshot } from './hostData';
import { money } from './format';
import { PuzzleBoard } from './PuzzleBoard';
import styles from './BonusRound.module.css';

export interface BonusRoundProps {
  view: AudienceView;
  wheelDeg: number;
  spinning: boolean;
  clock: ClockSnapshot | null;
  envelopeOpening: boolean;
  flash: 'good' | 'bad' | null;
  continueLabel: string | null;
  showButtons: boolean;
  onCategory: (category: string) => void;
  onSpin: () => void;
  onContinue: () => void;
  onOpenEnvelope: () => void;
  /** Rule or type a guess at the Bonus puzzle (the phone's SOLVE does the same). */
  onGuess: () => void;
}

const PROMPT: Record<string, string> = {
  'bonus-category': 'PICK A CATEGORY',
  'bonus-spin': 'SPIN THE BONUS WHEEL',
  'bonus-ready': 'READY? YOU GET 10 SECONDS',
  'bonus-solving': 'SOLVE IT!',
  'bonus-timeup': "TIME'S UP",
  'bonus-won': 'SOLVED!',
};

/**
 * The Bonus Round (FR-040, inventory 2.10): category pick of three, the Bonus Wheel of sealed envelopes,
 * RSTLNE, the letter calls, the 10 second clock and the envelope. The value is on screen only after the
 * envelope is opened (P-002).
 */
export const BonusRound = ({
  view,
  wheelDeg,
  spinning,
  clock,
  envelopeOpening,
  flash,
  continueLabel,
  showButtons,
  onCategory,
  onSpin,
  onContinue,
  onOpenEnvelope,
  onGuess,
}: BonusRoundProps) => {
  const bonus = view.bonus;
  const team = view.teams.find((t) => t.id === bonus?.team);
  const quota = team?.wildCard === true ? 4 : 3;
  const pickedConsonants = bonus?.picked.filter((l) => !isVowel(l)).length ?? 0;
  const pickedVowels = bonus?.picked.filter((l) => isVowel(l)).length ?? 0;
  const solved = view.phase === 'bonus-won' || (view.phase === 'bonus-opened' && bonus?.won === true);
  const showWheel = view.phase === 'bonus-spin' || spinning;
  const opened = view.phase === 'bonus-opened';
  const canOpen = view.phase === 'bonus-won' || view.phase === 'bonus-timeup';

  return (
    <div className={styles.root} data-testid="bonus-round" data-phase={view.phase}>
      <h2 className={styles.who}>{team ? `${team.name} PLAYS FOR THE ENVELOPE` : 'BONUS ROUND'}</h2>
      <div className={styles.main}>
        <div className={styles.left}>
          <PuzzleBoard board={view.board} solved={solved} flash={flash} />
          {view.phase === 'bonus-letters' ? (
            <p className={styles.prompt} role="status">
              CALL {quota - pickedConsonants} CONSONANT{quota - pickedConsonants === 1 ? '' : 'S'} AND{' '}
              {1 - pickedVowels} VOWEL
              {bonus && bonus.picked.length > 0 ? ` | CALLED: ${bonus.picked.join(' ')}` : ''}
            </p>
          ) : (
            <p className={styles.prompt} role="status">
              {PROMPT[view.phase] ?? ''}
            </p>
          )}
          {view.phase === 'bonus-solving' ? <ClockBar clock={clock} /> : null}
          {showButtons && ['bonus-letters', 'bonus-ready', 'bonus-solving'].includes(view.phase) ? (
            <Button variant="secondary" onClick={onGuess}>
              Guess: type or rule
            </Button>
          ) : null}
        </div>
        <div className={styles.right}>
          {view.phase === 'bonus-category' && bonus ? (
            <Panel className={styles.categories}>
              {bonus.categories.map((c, i) => (
                <Button
                  key={c}
                  size="lg"
                  variant="tertiary"
                  disabled={!showButtons}
                  className={styles.categoryButton}
                  onClick={() => {
                    onCategory(c);
                  }}
                >
                  {i + 1}. {c}
                </Button>
              ))}
            </Panel>
          ) : null}
          {showWheel ? (
            <div className={styles.wheelSlot}>
              <BonusWheel angleDeg={wheelDeg} spinning={spinning} />
            </div>
          ) : null}
          {view.phase === 'bonus-spin' && !spinning && showButtons ? (
            <Button variant="primary" size="lg" onClick={onSpin}>
              Spin (Space)
            </Button>
          ) : null}
          {!showWheel && view.phase !== 'bonus-category' ? (
            <Panel className={styles.envelope} data-testid="envelope-card" data-opened={opened}>
              {opened ? (
                <>
                  <h3 className={styles.envelopeTitle}>
                    {bonus?.won === true ? 'YOU WIN!' : 'NOT THIS TIME'}
                  </h3>
                  <p className={styles.prize} data-testid="envelope-prize">
                    {bonus?.prize
                      ? bonus.prize.kind === 'car'
                        ? `A CAR (${money(bonus.prize.value)})`
                        : money(bonus.prize.value)
                      : ''}
                  </p>
                </>
              ) : (
                <>
                  <h3 className={styles.envelopeTitle}>
                    {envelopeOpening ? 'OPENING THE ENVELOPE...' : 'THE ENVELOPE IS SEALED'}
                  </h3>
                  <div className={styles.sealed} aria-hidden="true" />
                </>
              )}
              {canOpen && !envelopeOpening && showButtons ? (
                <Button variant="primary" size="lg" onClick={onOpenEnvelope}>
                  Open the envelope (Enter)
                </Button>
              ) : null}
              {continueLabel && view.phase !== 'bonus-won' && view.phase !== 'bonus-timeup' && showButtons ? (
                <Button variant="primary" size="lg" onClick={onContinue}>
                  {continueLabel} (Enter)
                </Button>
              ) : null}
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
};
