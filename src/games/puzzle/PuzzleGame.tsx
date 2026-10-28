import { useEffect, useState, useSyncExternalStore } from 'react';
import type { AudioPlayer } from '@/audio/player';
import { MatchOverlay } from './MatchOverlay';
import { PuzzleController, browserScheduler } from './controller';
import { createPuzzleAudio } from './puzzleAudio';
import styles from './PuzzleGame.module.css';
import { PuzzleCanvas } from './PuzzleCanvas';
import { SetupScreen } from './SetupScreen';
import { TitleScreen } from './TitleScreen';

export interface PuzzleGameProps {
  /** True while paused (F8) or any app dialog is open: no ticks, no keys. */
  inputLocked: boolean;
  /** Audience-facing mode: hides the keyboard hints. */
  showMode: boolean;
  audio: AudioPlayer;
  onQuitToHub: () => void;
  /** Seed of the first match; random when omitted. */
  seed?: number;
}

/** The capsule puzzle game: title card, setup tiles, then 1P or 2P versus on a canvas. */
export const PuzzleGame = ({ inputLocked, showMode, audio, onQuitToHub, seed }: PuzzleGameProps) => {
  const [controller] = useState(
    () =>
      new PuzzleController({
        audio: createPuzzleAudio(audio),
        ...(seed !== undefined ? { seed } : {}),
      }),
  );
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  useEffect(() => {
    controller.setQuitHandler(onQuitToHub);
  }, [controller, onQuitToHub]);

  useEffect(() => {
    controller.setInputLocked(inputLocked);
  }, [controller, inputLocked]);

  useEffect(() => {
    const down = (event: KeyboardEvent): void => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (controller.handleKeyDown({ key: event.key, repeat: event.repeat })) event.preventDefault();
    };
    const up = (event: KeyboardEvent): void => {
      controller.handleKeyUp({ key: event.key });
    };
    const blur = (): void => {
      controller.handleBlur();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    controller.start(browserScheduler());
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      controller.stop();
    };
  }, [controller]);

  useEffect(
    () => () => {
      controller.dispose();
    },
    [controller],
  );

  const showHints = !showMode;
  return (
    <div className={styles.root} data-testid="puzzle-game" data-phase={snapshot.phase}>
      {snapshot.phase === 'title' ? (
        <TitleScreen controller={controller} cursor={snapshot.titleIndex} showHints={showHints} />
      ) : null}
      {snapshot.phase === 'setup' ? (
        <SetupScreen controller={controller} setup={snapshot.setup} showHints={showHints} />
      ) : null}
      {snapshot.phase === 'match' ? (
        <div className={styles.match}>
          <PuzzleCanvas controller={controller} players={snapshot.match.players.length} />
          {showHints ? (
            <p className={styles.hints}>
              {snapshot.match.players.length > 1
                ? 'P1: A D move, S drop, W rotate, Q rotate back, Space slam. P2: arrows, / rotate back, Enter slam. P or Esc pauses.'
                : 'A D or arrows move, S or Down drops, W or Up rotates, Space slams. P or Esc pauses.'}
            </p>
          ) : null}
          <MatchOverlay controller={controller} snapshot={snapshot} showHints={showHints} />
        </div>
      ) : null}
    </div>
  );
};
