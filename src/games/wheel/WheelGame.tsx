import { useEffect, useState } from 'react';
import type { WheelPuzzle } from '@/content';
import { useReducedMotion } from '@/design';
import type { WheelSettings } from '@/engines/wheel/types';
import type { GameProps } from '@/stage/gameContract';
import { BonusRound } from './BonusRound';
import { CategoryStrip } from './CategoryStrip';
import { ExpressDialog } from './ExpressDialog';
import { GameWheel } from './GameWheel';
import { LetterKeyboard } from './LetterKeyboard';
import { MysteryDialog } from './MysteryDialog';
import { Podiums } from './Podiums';
import { PuzzleBoard } from './PuzzleBoard';
import { ResultPlate } from './ResultPlate';
import { RoundAward } from './RoundAward';
import { SolveModal } from './SolveModal';
import { StageBanner } from './StageBanner';
import { TiebreakerCard } from './TiebreakerCard';
import { TossUp } from './TossUp';
import { VowelModal } from './VowelModal';
import { WheelController } from './WheelController';
import { WheelHostBar } from './WheelHostBar';
import { WheelPauseMenu } from './WheelPauseMenu';
import { WildCardPrompt } from './WildCardPrompt';
import { WinnerCard } from './WinnerCard';
import { money } from './format';
import { useWheelSnapshot } from './useWheelController';
import { useWheelSpin } from './useWheelSpin';
import styles from './WheelGame.module.css';

export interface WheelGameProps extends GameProps {
  /**
   * Host settings for this game (opening, Speed-Up start, length, Bonus Round, turn timer). An explicit
   * override (previews, tests); without it the game uses the stage's saved `gameSettings.wheel`.
   */
  settings?: Partial<WheelSettings>;
  /** The "next game" form was saved. Also reported to the stage through `onSaveSettings('wheel', ...)`. */
  onSettingsSave?: (settings: WheelSettings) => void;
  /** OPTIONS in the pause menu opens the app Settings. */
  onOpenOptions?: () => void;
  /** Injected randomness for spins, reveals and content picks. */
  rng?: () => number;
  /** Content to draw from; defaults to the bundled file. */
  puzzles?: readonly WheelPuzzle[];
  /** Let host commands through while the stage is locked (for a stage that locks for the F2 drawer). */
  allowHostWhileLocked?: boolean;
}

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable);

const HEADING: Record<string, string> = {
  tossup: 'TOSS-UP',
  frenzy: 'FORTUNE FRENZY',
  triple: 'TRIPLE TOSS-UP',
  tiebreak: 'TIEBREAKER',
  speedup: 'SPEED-UP',
  bonus: 'BONUS ROUND',
  'game-over': 'GAME OVER',
};

/**
 * The Wheel of Fortune stage screen (FR-040..045, design.md 8.2, 9). It renders what the controller
 * publishes and sends every click and key back through the controller's commands, the same ones the host
 * console uses, so the engine stays the only authority. It receives the audience view only (P-002).
 */
export const WheelGame = (props: WheelGameProps) => {
  const { showMode, inputLocked } = props;
  const startSettings: Partial<WheelSettings> | undefined = props.settings ?? props.gameSettings?.wheel;
  const [controller] = useState(
    () =>
      new WheelController({
        teams: orderTeams(props),
        ...(startSettings ? { settings: startSettings } : {}),
        ...(props.initialState === undefined ? {} : { initialState: props.initialState }),
        ...(props.rng ? { rng: props.rng } : {}),
        ...(props.puzzles ? { puzzles: props.puzzles } : {}),
        usedContentIds: props.usedContentIds,
        audio: props.audio,
        phones: props.phones,
        host: props.host,
        inputLocked: props.inputLocked,
        ...(props.allowHostWhileLocked === undefined
          ? {}
          : { allowHostWhileLocked: props.allowHostWhileLocked }),
      }),
  );
  // The latest callbacks, swapped in after every render (runs before the start effect below).
  useEffect(() => {
    controller.setHandlers({
      onStateChange: (state) => {
        props.onStateChange(state);
      },
      onGameEnd: (report) => {
        props.onGameEnd(report);
      },
      onContentUsed: (ids) => {
        props.onContentUsed(ids);
      },
      onSettingsSave: (settings) => {
        props.onSettingsSave?.(settings);
        props.onSaveSettings?.('wheel', settings);
      },
    });
  });
  // The stage's Settings can change the saved next-game rules while this game runs: the console form follows.
  const savedWheel = props.settings === undefined ? props.gameSettings?.wheel : undefined;
  useEffect(() => {
    if (savedWheel) controller.syncNextSettings(savedWheel);
  }, [controller, savedWheel]);

  const reducedMotion = useReducedMotion();
  useEffect(() => {
    controller.start();
    return () => {
      controller.dispose();
    };
  }, [controller]);
  useEffect(() => {
    controller.setInputLocked(inputLocked);
  }, [controller, inputLocked]);
  useEffect(() => {
    controller.setReducedMotion(reducedMotion);
  }, [controller, reducedMotion]);

  const snap = useWheelSnapshot(controller);
  const { view } = snap;
  const [menuOpen, setMenuOpen] = useState(false);
  const [guessOpen, setGuessOpen] = useState(false);
  useEffect(() => {
    controller.setMenuOpen(menuOpen);
  }, [controller, menuOpen]);

  const run = (name: string, args?: Record<string, unknown>, teamId?: number) => {
    controller.run(name, args, teamId);
  };

  // --- hotkeys (inventory 2.1, 2.9): Space spins, letters call, Enter solves or moves on ------------
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      if (isTyping(event.target)) return;
      const s = controller.getSnapshot();
      if (s.inputLocked || s.spinning) return;
      const phase = s.view.phase;
      if (phase === 'solving' || phase === 'tossup-answer' || s.vowelPickTeam !== null) return;
      const has = (t: string) => (s.legal as readonly string[]).includes(t);

      if (event.key === ' ') {
        event.preventDefault();
        controller.run('spin');
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        if (s.canLateSolve) controller.run('solve-start');
        else if (phase === 'bonus-won' || phase === 'bonus-timeup') controller.run('open-envelope');
        else if (s.continueLabel !== null) controller.run('continue');
        else if (has('SOLVE_START')) controller.run('solve-start');
        return;
      }
      if (event.key.length !== 1) return;
      const key = event.key.toUpperCase();
      if (phase === 'bonus-category' && /^[1-3]$/.test(event.key)) {
        const category = s.view.bonus?.categories[Number(event.key) - 1];
        if (category !== undefined) controller.run('bonus-category', { category });
        return;
      }
      if (phase === 'mystery-choice' && (key === 'K' || key === 'F')) {
        controller.run('mystery', { choice: key === 'K' ? 'keep' : 'flip' });
        return;
      }
      if (phase === 'express-choice' && (key === 'R' || key === 'P')) {
        controller.run('express', { choice: key === 'R' ? 'play' : 'pass' });
        return;
      }
      if (!/^[A-Z]$/.test(key)) return;
      // Shift+B / Shift+T / Shift+U are the commands (buy a vowel, the time bell, undo). A plain letter is a
      // letter whenever the engine takes it; B and T fall back to their commands when it does not. A plain
      // U never undoes, so a stray vowel can not take back a ruling.
      if (event.shiftKey && (key === 'B' || key === 'T' || key === 'U')) {
        controller.run(key === 'B' ? 'open-vowel-pick' : key === 'T' ? 'ring-bell' : 'undo');
        return;
      }
      if (controller.run('letter', { letter: key }).applied) {
        event.preventDefault();
        return;
      }
      if (key === 'B') controller.run('open-vowel-pick');
      else if (key === 'T') controller.run('ring-bell');
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [controller]);

  const spin = useWheelSpin(snap);
  const teamName = (id: number | null): string => view.teams.find((t) => t.id === id)?.name ?? '';
  const colors = snap.teamColors;
  const showButtons = !showMode;
  const stage = view.stage;
  const tossupLike = stage === 'tossup' || stage === 'frenzy' || stage === 'triple' || stage === 'tiebreak';
  const roundLike = stage === 'round' || stage === 'speedup';
  const phase = view.phase;
  const heading = stage === 'round' ? `ROUND ${String(view.round)}` : (HEADING[stage] ?? stage.toUpperCase());
  const active =
    stage === 'bonus' ? (view.bonus?.team ?? null) : phase === 'tossup-answer' ? view.buzzed : view.turn;
  const answering = phase === 'tossup-answer';
  const guessing = guessOpen && stage === 'bonus';
  const solving = phase === 'solving' || answering || guessing;
  const solvingTeam = snap.actingTeam;
  const awardOpen = phase === 'round-award' && view.award !== null && !snap.spinning;
  const pauseOpen = menuOpen;

  return (
    <section
      className={styles.screen}
      data-testid="wheel-game"
      data-stage={stage}
      data-phase={phase}
      data-show-mode={showMode}
    >
      {stage !== 'game-over' ? (
        <header className={styles.top}>
          <CategoryStrip
            heading={heading}
            category={view.category ?? (phase === 'awaiting-puzzles' ? 'GETTING THE PUZZLE READY' : null)}
            theme={view.theme}
            prizePuzzle={view.prizePuzzle}
            notice={snap.notice}
          />
        </header>
      ) : null}

      {stage === 'bonus' ? (
        <BonusRound
          view={view}
          wheelDeg={snap.bonusDeg}
          spinning={snap.spinning}
          clock={snap.clock}
          envelopeOpening={snap.envelopeOpening}
          flash={snap.flash}
          continueLabel={snap.continueLabel}
          showButtons={showButtons}
          onCategory={(category) => {
            run('bonus-category', { category });
          }}
          onSpin={() => {
            run('spin');
          }}
          onContinue={() => {
            run('continue');
          }}
          onOpenEnvelope={() => {
            run('open-envelope');
          }}
          onGuess={() => {
            setGuessOpen(true);
          }}
        />
      ) : stage !== 'game-over' ? (
        <main className={styles.main}>
          <div className={styles.left}>
            <PuzzleBoard
              board={view.board}
              solved={phase === 'round-award' || phase === 'tossup-done'}
              flash={snap.flash}
            />
            <div className={styles.prompt} role="status" data-testid="prompt">
              {promptFor(view, snap.continueLabel, teamName(solvingTeam), snap.spinning)}
            </div>
            {roundLike ? (
              <LetterKeyboard
                called={view.called}
                callable={snap.letters.call}
                buyable={snap.letters.buy}
                disabled={snap.inputLocked || snap.spinning}
                onLetter={(letter) => {
                  run('letter', { letter });
                }}
              />
            ) : null}
            {showButtons ? (
              <WheelHostBar
                legal={snap.legal}
                continueLabel={awardOpen ? null : snap.continueLabel}
                gameOver={false}
                canLateSolve={snap.canLateSolve}
                run={run}
                onPause={() => {
                  setMenuOpen(true);
                }}
              />
            ) : null}
          </div>
          <div className={styles.right}>
            {stage === 'triple' && view.triple ? (
              <StageBanner
                kind="triple"
                detail={`PUZZLE ${String(view.triple.index + 1)} OF 3 | $2,000 EACH, $4,000 FOR A SWEEP`}
              />
            ) : null}
            {stage === 'speedup' ? <StageBanner kind="speedup" value={view.speedUp?.value ?? null} /> : null}
            {tossupLike && stage !== 'tiebreak' ? <TossUp view={view} clock={snap.clock} /> : null}
            {stage === 'tiebreak' ? (
              <>
                <TiebreakerCard view={view} />
                <TossUp view={view} clock={snap.clock} />
              </>
            ) : null}
            {roundLike ? (
              <div className={styles.wheelSlot}>
                <GameWheel wedges={view.wheel} angleDeg={spin.angleDeg} spinning={spin.spinning} />
              </div>
            ) : null}
          </div>
        </main>
      ) : null}

      {stage !== 'game-over' ? (
        <footer className={styles.bottom}>
          <Podiums
            teams={view.teams}
            colors={colors}
            active={active}
            wildCardPlaying={snap.wildCardPlaying}
            clock={roundLike ? snap.clock : null}
          />
        </footer>
      ) : null}

      {roundLike && snap.legal.includes('PLAY_WILD_CARD') && !snap.spinning ? (
        <div className={styles.wild}>
          <WildCardPrompt
            teamName={teamName(view.turn)}
            showButtons={showButtons}
            onPlay={() => {
              run('play-wild-card');
            }}
          />
        </div>
      ) : null}

      {phase === 'mystery-choice' && !snap.spinning ? (
        <MysteryDialog
          teamName={teamName(view.turn)}
          earned={snap.spinEarned}
          showButtons={showButtons}
          onKeep={() => {
            run('mystery', { choice: 'keep' });
          }}
          onFlip={() => {
            run('mystery', { choice: 'flip' });
          }}
        />
      ) : null}
      {phase === 'express-choice' && !snap.spinning ? (
        <ExpressDialog
          teamName={teamName(view.turn)}
          showButtons={showButtons}
          onPlay={() => {
            run('express', { choice: 'play' });
          }}
          onPass={() => {
            run('express', { choice: 'pass' });
          }}
        />
      ) : null}
      {snap.plate && !snap.spinning ? (
        <ResultPlate plate={snap.plate} teamName={teamName(snap.plate.team)} />
      ) : null}
      {awardOpen && view.award ? (
        <RoundAward
          award={view.award}
          view={view}
          continueLabel={snap.continueLabel}
          showButtons={showButtons}
          onContinue={() => {
            run('continue');
          }}
        />
      ) : null}
      {stage === 'game-over' && snap.result ? (
        <WinnerCard
          result={snap.result}
          teams={view.teams}
          showButtons={showButtons}
          onContinue={() => {
            run('continue');
          }}
        />
      ) : null}

      {showButtons ? (
        <SolveModal
          open={solving && !pauseOpen}
          teamName={teamName(solvingTeam)}
          judging={snap.judging !== null}
          cancelLabel={answering || guessing ? 'Close' : 'Cancel'}
          onSubmit={(answer) => {
            run('solve', { answer }, solvingTeam ?? undefined);
            if (guessing) setGuessOpen(false);
          }}
          onRule={(verdict) => {
            run('rule', { verdict });
            if (guessing) setGuessOpen(false);
          }}
          onAccept={() => {
            run('accept-pending');
          }}
          onReject={() => {
            run('reject-pending');
          }}
          onCancel={() => {
            if (phase === 'solving') run('solve-cancel');
            setGuessOpen(false);
          }}
        />
      ) : null}
      <VowelModal
        open={snap.vowelPickTeam !== null && !pauseOpen}
        teamName={teamName(snap.vowelPickTeam)}
        called={view.called}
        buyable={snap.letters.buy}
        onPick={(letter) => {
          run('buy-vowel', { letter });
        }}
        onCancel={() => {
          run('close-vowel-pick');
        }}
      />
      <WheelPauseMenu
        open={pauseOpen}
        canRestart={snap.legal.includes('THROW_OUT_PUZZLE')}
        onResume={() => {
          setMenuOpen(false);
        }}
        onRestart={() => {
          run('throw-out');
          setMenuOpen(false);
        }}
        onOptions={() => {
          props.onOpenOptions?.();
        }}
        onQuit={() => {
          setMenuOpen(false);
          props.onQuitToHub();
        }}
      />
    </section>
  );
};

/** Teams in play order, with the event's colours. */
function orderTeams(props: GameProps): { id: number; name: string; color: string }[] {
  const byId = new Map(props.teams.map((t) => [t.id, t]));
  const order = props.playOrder ?? props.teams.map((t) => t.id);
  const ordered = order.flatMap((id) => {
    const t = byId.get(id);
    return t ? [{ id: t.id, name: t.name, color: t.color }] : [];
  });
  // Teams missing from the order still play, after it.
  const missing = props.teams.filter((t) => !order.includes(t.id));
  return [...ordered, ...missing.map((t) => ({ id: t.id, name: t.name, color: t.color }))];
}

/** The one-line instruction under the board. */
function promptFor(
  view: ReturnType<typeof useWheelSnapshot>['view'],
  continueLabel: string | null,
  solverName: string,
  spinning: boolean,
): string {
  const turn = (view.teams.find((t) => t.id === view.turn)?.name ?? '').toUpperCase();
  solverName = solverName.toUpperCase();
  if (spinning) return `${turn} IS SPINNING...`;
  switch (view.phase) {
    case 'awaiting-puzzles':
      return 'GETTING THE PUZZLE READY...';
    case 'choose':
      return `${turn}: SPIN, BUY A VOWEL OR SOLVE`;
    case 'call-consonant':
      return `${turn}: CALL A CONSONANT${view.spin ? ` (${money(view.spin.value)} EACH)` : ''}`;
    case 'express-run':
      return `${turn}: ON THE EXPRESS, CONSONANTS PAY $1,000`;
    case 'solving':
      return `${solverName} IS SOLVING...`;
    case 'speedup-spin':
      return `${turn}: SPIN FOR THE SPEED-UP`;
    case 'speedup-act':
      return `${turn}: CALL A LETTER OR SOLVE`;
    case 'speedup-window':
      return `${turn}: SOLVE NOW!`;
    case 'tossup-done':
      return continueLabel ?? 'TOSS-UP OVER';
    default:
      return '';
  }
}
