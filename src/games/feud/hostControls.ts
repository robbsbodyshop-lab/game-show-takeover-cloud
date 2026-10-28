/**
 * The host's buttons for the current moment (HOST_FEATURE_INVENTORY.md 2.7 and 2.8), as plain data
 * shared by the stage's host bar and the console. Labels never contain survey answers (P-002).
 */
import { REVEAL_STEPS, fastMoneyTotal } from '@/engines/feud/fastMoney';
import type { HostView } from '@/engines/feud/selectors';
import { otherSide, type Side } from '@/engines/feud/types';

export type ControlVariant = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'confirm' | 'host' | 'quiet';
export type ControlGroup = 'flow' | 'ruling' | 'round' | 'fast-money' | 'tools';

export interface HostControl {
  /** Unique within one list; also a stable React key. */
  id: string;
  command: string;
  args?: Record<string, unknown>;
  label: string;
  variant: ControlVariant;
  group: ControlGroup;
  /** Shown as a hint on the button; the stage's key handler owns the binding. */
  hotkey?: string;
  /** Present when the button needs two taps; this is the armed label. */
  confirmLabel?: string;
}

export interface ControlContext {
  names: Readonly<Record<Side, string>>;
  /** A "survey says" beat or a host review is waiting: only Undo and the beat-skipper make sense. */
  busy: boolean;
}

/** Label of the Enter step for this moment, or null when Enter has nothing to do. */
export const advanceLabel = (view: HostView): string | null => {
  const fm = view.fastMoney;
  switch (view.phase) {
    case 'pre-game':
      return 'Start round 1';
    case 'round-intro':
      return `Start round ${view.round.toString()}`;
    case 'sudden-death':
      return 'Start Sudden Death';
    case 'face-off':
      return view.faceOff?.stage === 'ready' ? 'Start the face-off' : null;
    case 'steal-confer':
      return "Take the captain's answer";
    case 'round-decided':
      return 'Reveal next answer';
    case 'round-summary':
      return view.gameWinner === null ? 'Next round' : 'Continue';
    case 'game-won':
      return fm === null ? 'Finish the game' : 'Play Fast Money';
    case 'fast-money':
      if (fm === null) return null;
      if (fm.phase === 'p1-ready' || fm.phase === 'p2-ready') return 'Start the clock';
      if (fm.phase === 'p1-reveal' || fm.phase === 'p2-reveal') {
        const step = fm.phase === 'p1-reveal' ? fm.reveal.p1 : fm.reveal.p2;
        return step >= REVEAL_STEPS - 1 ? 'Clear the board' : 'Reveal next';
      }
      return null;
    case 'game-over':
      return 'Continue';
    default:
      return null;
  }
};

const ROUND_PHASES = ['face-off', 'play-or-pass', 'control', 'steal-confer', 'steal-answer'] as const;

export const buildHostControls = (view: HostView, context: ControlContext): HostControl[] => {
  const controls: HostControl[] = [];
  const { names, busy } = context;
  const fm = view.fastMoney;

  const next = advanceLabel(view);
  if (next !== null) {
    controls.push({
      id: 'advance',
      command: 'advance',
      label: next,
      variant: 'primary',
      group: 'flow',
      hotkey: 'Enter',
    });
  }
  if (busy) {
    if (view.canUndo) {
      controls.push({
        id: 'undo',
        command: 'undo',
        label: 'Undo',
        variant: 'quiet',
        group: 'tools',
        hotkey: 'U',
      });
    }
    return controls;
  }

  const faceOff = view.faceOff;
  switch (view.phase) {
    case 'face-off':
      if (faceOff?.stage === 'buzzers-open') {
        (['A', 'B'] as const).forEach((side) => {
          controls.push({
            id: `first-${side}`,
            command: 'who-buzzed-first',
            args: { team: side },
            label: `${names[side]} buzzed first`,
            variant: 'secondary',
            group: 'ruling',
          });
        });
      }
      if (faceOff?.stage === 'first-answer' || faceOff?.stage === 'second-answer') {
        controls.push({
          id: 'strike',
          command: 'strike',
          label: 'Miss (X)',
          variant: 'danger',
          group: 'ruling',
          hotkey: 'X',
        });
        if (faceOff.stage === 'first-answer' && faceOff.pair === 0 && faceOff.first !== null) {
          const other = otherSide(faceOff.first);
          controls.push({
            id: 'swap-first',
            command: 'who-buzzed-first',
            args: { team: other },
            label: `${names[other]} buzzed first`,
            variant: 'quiet',
            group: 'ruling',
          });
        }
      }
      break;
    case 'play-or-pass': {
      const winner = faceOff?.winner;
      if (winner != null) {
        controls.push(
          {
            id: 'play',
            command: 'play',
            label: `${names[winner]} play`,
            variant: 'confirm',
            group: 'ruling',
            hotkey: 'Y',
          },
          {
            id: 'pass',
            command: 'pass',
            label: `${names[winner]} pass`,
            variant: 'secondary',
            group: 'ruling',
            hotkey: 'P',
          },
        );
      }
      break;
    }
    case 'control':
      controls.push(
        {
          id: 'strike',
          command: 'strike',
          label: 'Strike (X)',
          variant: 'danger',
          group: 'ruling',
          hotkey: 'X',
        },
        { id: 'pass', command: 'pass', label: 'Passed', variant: 'secondary', group: 'ruling', hotkey: 'P' },
        { id: 'timeout', command: 'timeout', label: 'Out of time', variant: 'secondary', group: 'ruling' },
        {
          id: 'repeat',
          command: 'repeat',
          label: 'Already up, ask again',
          variant: 'quiet',
          group: 'ruling',
        },
      );
      break;
    case 'steal-confer':
    case 'steal-answer':
      controls.push({
        id: 'strike',
        command: 'strike',
        label: 'Steal fails',
        variant: 'danger',
        group: 'ruling',
        hotkey: 'X',
      });
      break;
    case 'round-decided':
      controls.push(
        {
          id: 'reveal-next',
          command: 'reveal-next',
          label: 'Reveal next',
          variant: 'secondary',
          group: 'round',
          hotkey: 'R',
        },
        {
          id: 'reveal-all',
          command: 'reveal-all',
          label: 'Reveal all',
          variant: 'secondary',
          group: 'round',
        },
      );
      break;
    case 'game-won':
      controls.push({
        id: 'skip-fm',
        command: 'skip-fm',
        label: 'Skip Fast Money',
        confirmLabel: 'Tap again: skip Fast Money',
        variant: 'quiet',
        group: 'fast-money',
      });
      break;
    case 'fast-money':
      if (fm !== null) {
        if (fm.phase === 'setup' || fm.phase === 'p1-ready') {
          controls.push(
            {
              id: 'fm-deal',
              command: 'fm-deal',
              label: 'Deal new questions',
              variant: 'secondary',
              group: 'fast-money',
            },
            {
              id: 'skip-fm',
              command: 'skip-fm',
              label: 'Skip Fast Money',
              confirmLabel: 'Tap again: skip Fast Money',
              variant: 'quiet',
              group: 'fast-money',
            },
          );
        }
        if (fm.phase === 'p1-playing' || fm.phase === 'p2-playing') {
          controls.push(
            {
              id: 'fm-pass',
              command: 'fm-pass',
              label: 'Pass',
              variant: 'secondary',
              group: 'fast-money',
              hotkey: 'P',
            },
            fm.clock.running
              ? {
                  id: 'fm-pause',
                  command: 'fm-pause',
                  label: 'Stop the clock',
                  variant: 'danger',
                  group: 'fast-money',
                }
              : {
                  id: 'fm-resume',
                  command: 'fm-resume',
                  label: 'Resume the clock',
                  variant: 'confirm',
                  group: 'fast-money',
                },
          );
        }
        if (fm.phase === 'p1-reveal' || fm.phase === 'p2-reveal') {
          controls.push({
            id: 'fm-reveal-all',
            command: 'fm-reveal-all',
            label: 'Reveal all',
            variant: 'secondary',
            group: 'fast-money',
          });
        }
        if (
          fm.phase === 'p2-playing' ||
          fm.phase === 'p1-reveal' ||
          fm.phase === 'p2-ready' ||
          fm.phase === 'p2-reveal'
        ) {
          controls.push({
            id: 'fm-duplicate',
            command: 'fm-duplicate-buzzer',
            label: 'Play the duplicate buzzer',
            variant: 'quiet',
            group: 'fast-money',
          });
        }
        if (fm.phase !== 'setup' && fm.phase !== 'p1-ready' && fm.phase !== 'done') {
          const total = fastMoneyTotal(fm);
          controls.push({
            id: 'fm-end',
            command: 'fm-end',
            label: `End Fast Money now (keep ${total.toString()} points)`,
            confirmLabel: `Tap again: end and keep ${total.toString()} points`,
            variant: 'danger',
            group: 'fast-money',
          });
        }
      }
      break;
    default:
      break;
  }

  if ((ROUND_PHASES as readonly string[]).includes(view.phase)) {
    controls.push({
      id: 'replace-survey',
      command: 'replace-survey',
      label: 'Replace question',
      variant: 'quiet',
      group: 'round',
    });
    if (!view.suddenDeath) {
      for (const value of [1, 2, 3]) {
        controls.push({
          id: `multiplier-${value.toString()}`,
          command: 'set-multiplier',
          args: { value },
          label: `x${value.toString()}`,
          variant: view.multiplier === value ? 'confirm' : 'quiet',
          group: 'round',
        });
      }
    }
  }
  if (view.canUndo) {
    controls.push({
      id: 'undo',
      command: 'undo',
      label: 'Undo',
      variant: 'quiet',
      group: 'tools',
      hotkey: 'U',
    });
  }
  return controls;
};
