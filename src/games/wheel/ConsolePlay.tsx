import { ALPHABET } from '@/engines/wheel/letters';
import { Button, Inset, Label } from '@/design';
import type { ConsoleSectionProps } from './consoleTypes';
import { has } from './consoleTypes';
import { money } from './format';
import styles from './WheelConsole.module.css';

/** Flow, play and turn tools: everything the stage buttons do, plus Skip, Set turn, Throw out, End unsolved. */
export const ConsolePlay = ({ data, send }: ConsoleSectionProps) => {
  const acting = data.acting ?? undefined;
  const bonus = data.bonus;
  return (
    <>
      <div className={styles.group}>
        <Label>Flow</Label>
        <Inset className={styles.tools}>
          <Button
            variant="confirm"
            disabled={!has(data, 'CONTINUE') && !data.gameOver}
            onClick={() => {
              send('continue');
            }}
          >
            Continue
          </Button>
          <Button
            variant="tertiary"
            disabled={!has(data, 'RING_BELL')}
            onClick={() => {
              send('ring-bell');
            }}
          >
            Ring the time bell
          </Button>
          <Button
            variant="quiet"
            disabled={!has(data, 'LIGHT_ALL')}
            onClick={() => {
              send('light-all');
            }}
          >
            Turn all lit letters
          </Button>
          <Button
            variant="secondary"
            disabled={data.phase !== 'bonus-won' && data.phase !== 'bonus-timeup'}
            onClick={() => {
              send('open-envelope');
            }}
          >
            Open envelope
          </Button>
          <Button
            variant="host"
            disabled={!data.canUndo}
            onClick={() => {
              send('undo');
            }}
          >
            Undo last step
          </Button>
        </Inset>
      </div>

      <div className={styles.group}>
        <Label>Play</Label>
        <Inset className={styles.tools}>
          <Button
            variant="primary"
            disabled={!has(data, 'SPIN', 'SPEEDUP_SPIN', 'BONUS_SPIN')}
            onClick={() => {
              send('spin', undefined, acting);
            }}
          >
            Spin
          </Button>
          <Button
            variant="secondary"
            disabled={!has(data, 'SOLVE_START')}
            onClick={() => {
              send('solve-start', undefined, acting);
            }}
          >
            Solve
          </Button>
          <Button
            variant="quiet"
            disabled={!has(data, 'SOLVE_CANCEL')}
            onClick={() => {
              send('solve-cancel', undefined, acting);
            }}
          >
            Cancel solve
          </Button>
          <Button
            variant="host"
            disabled={!has(data, 'PLAY_WILD_CARD')}
            onClick={() => {
              send('play-wild-card', undefined, acting);
            }}
          >
            Play the Wild Card
          </Button>
          {data.phase === 'mystery-choice' ? (
            <>
              <Button
                variant="confirm"
                onClick={() => {
                  send('mystery', { choice: 'keep' }, acting);
                }}
              >
                Keep
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  send('mystery', { choice: 'flip' }, acting);
                }}
              >
                Flip it
              </Button>
            </>
          ) : null}
          {data.phase === 'express-choice' ? (
            <>
              <Button
                variant="primary"
                onClick={() => {
                  send('express', { choice: 'play' }, acting);
                }}
              >
                Ride
              </Button>
              <Button
                variant="quiet"
                onClick={() => {
                  send('express', { choice: 'pass' }, acting);
                }}
              >
                Pass
              </Button>
            </>
          ) : null}
          {bonus && data.phase === 'bonus-category'
            ? bonus.categories.map((c) => (
                <Button
                  key={c}
                  variant="tertiary"
                  onClick={() => {
                    send('bonus-category', { category: c });
                  }}
                >
                  {c}
                </Button>
              ))
            : null}
        </Inset>
        <Inset className={styles.letters} role="group" aria-label="Call a letter">
          {ALPHABET.map((l) => {
            const callable =
              data.letters.call.includes(l) || data.letters.bonus.includes(l) || data.letters.buy.includes(l);
            return (
              <Button
                key={l}
                size="sm"
                variant={'AEIOU'.includes(l) ? 'tertiary' : 'secondary'}
                disabled={!callable}
                aria-label={`${'AEIOU'.includes(l) ? 'Buy' : 'Call'} ${l}`}
                className={data.called.includes(l) ? styles.called : undefined}
                onClick={() => {
                  send('letter', { letter: l }, acting);
                }}
              >
                {l}
              </Button>
            );
          })}
        </Inset>
      </div>

      <div className={styles.group}>
        <Label>Turn and puzzle</Label>
        <Inset className={styles.tools}>
          <Button
            variant="quiet"
            disabled={!has(data, 'SKIP_TURN')}
            onClick={() => {
              send('skip-turn', undefined, acting);
            }}
          >
            Skip to next team
          </Button>
          <span className={styles.setTurn} role="group" aria-label="Give the turn to">
            Give the turn to
            {data.teams.map((t) => (
              <Button
                key={t.id}
                size="sm"
                variant={t.id === data.turn ? 'confirm' : 'quiet'}
                disabled={!has(data, 'SET_TURN') || t.id === data.turn}
                onClick={() => {
                  send('set-turn', { team: t.id });
                }}
              >
                {t.name}
              </Button>
            ))}
          </span>
          <Button
            variant="danger"
            disabled={!has(data, 'THROW_OUT_PUZZLE')}
            onClick={() => {
              send('throw-out');
            }}
          >
            Throw out puzzle
          </Button>
          <Button
            variant="danger"
            disabled={!has(data, 'END_ROUND_UNSOLVED')}
            onClick={() => {
              send('end-unsolved');
            }}
          >
            End unsolved
          </Button>
        </Inset>
        <div className={styles.meta} data-testid="console-next">
          Next puzzle:{' '}
          {data.nextPuzzle
            ? `${data.nextPuzzle.category}: ${data.nextPuzzle.phrase}`
            : 'a fresh one is drawn on demand'}
        </div>
      </div>

      {data.envelope ? (
        <div className={styles.group}>
          <Label>Secret: the sealed envelope (host's eyes only)</Label>
          <Inset data-testid="console-envelope" className={styles.envelope}>
            {data.envelope.kind === 'car'
              ? `A CAR (${money(data.envelope.value)})`
              : money(data.envelope.value)}
            {bonus
              ? ` | letters called: ${bonus.picked.join(' ') || 'none yet'} | left: ${String(bonus.consonantsLeft)} consonant(s), ${String(bonus.vowelsLeft)} vowel(s)`
              : ''}
          </Inset>
        </div>
      ) : null}
    </>
  );
};
