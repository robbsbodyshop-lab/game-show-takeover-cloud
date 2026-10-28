/**
 * Which cue plays for which engine event (docs/reference/AUDIO_CUES_V1.md, Family Feud). The plan is
 * a pure function of the new events, so the controller plays each event's cues exactly once (by
 * `seq`). Timed Fast Money beds are not here: they follow the clock state (see the controller).
 */
import type { SoundName } from '@/audio/cues';
import { FM_JACKPOT } from '@/engines/feud/fastMoney';
import type { FeudEvent, FeudState } from '@/engines/feud/types';
import { FEUD_TIMING } from './timing';

export interface CueStep {
  readonly cue: SoundName;
  readonly delayMs: number;
  readonly overlap?: boolean;
}

export interface CueFlags {
  /** The jackpot fanfare has already played for this Fast Money. */
  readonly jackpotCued: boolean;
}

export interface CuePlan {
  readonly steps: readonly CueStep[];
  readonly flags: CueFlags;
}

const step = (cue: SoundName, delayMs = 0, overlap = false): CueStep =>
  overlap ? { cue, delayMs, overlap } : { cue, delayMs };

const wrongBuzz = (): CueStep[] => [step('ff_strike'), step('ff_crowd_aww', FEUD_TIMING.awwDelayMs)];

/** Cues for a batch of events produced by one engine change. */
export const planCues = (
  events: readonly FeudEvent[],
  prev: FeudState,
  next: FeudState,
  flags: CueFlags,
): CuePlan => {
  const steps: CueStep[] = [];
  let jackpotCued = flags.jackpotCued;
  const fmStarted = prev.phase === 'game-won' && next.phase === 'fast-money';
  let stingedFastMoney = false;

  for (const event of events) {
    switch (event.type) {
      case 'ROUND_STARTED':
        if (!event.suddenDeath) steps.push(step('ff_round_sting'));
        break;
      case 'BUZZED':
      case 'BUZZER_ASSIGNED':
        steps.push(step('ff_buzzer'));
        break;
      case 'ANSWER_REVEALED':
        steps.push(step('ff_reveal', 0, true));
        // The host's leftover reveals get the whoosh only; players' answers get the crowd.
        if (event.via !== 'leftover') steps.push(step('ff_crowd_cheer', FEUD_TIMING.cheerDelayMs));
        break;
      case 'FACEOFF_X':
      case 'STRIKE':
        steps.push(...wrongBuzz());
        break;
      case 'STEAL_RESULT':
        if (!event.success) steps.push(...wrongBuzz());
        break;
      case 'ROUND_DECIDED':
        steps.push(step('ff_bank_award'), step('applause'));
        // The sting after the applause leads into the next round; a won game has its own fanfare.
        if (next.gameWinner === null) steps.push(step('ff_round_sting', FEUD_TIMING.roundStingAfterWinMs));
        break;
      case 'SUDDEN_DEATH_READY':
        steps.push(step('ff_sudden_death'));
        break;
      case 'GAME_WON':
        steps.push(step('ff_game_win'));
        break;
      case 'FAST_MONEY': {
        if (fmStarted && !stingedFastMoney) {
          stingedFastMoney = true;
          steps.push(step('ff_round_sting'));
        }
        const inner = event.event;
        switch (inner.type) {
          case 'DUPLICATE':
            steps.push(step('ff_fm_duplicate'));
            break;
          case 'YOU_SAID':
            steps.push(step('ff_fm_blip'));
            break;
          case 'SURVEY_SAID':
            steps.push(step(inner.points > 0 ? 'ff_fm_points' : 'ff_fm_zero'));
            if (inner.total >= FM_JACKPOT && !jackpotCued) {
              jackpotCued = true;
              steps.push(step('ff_fm_win', FEUD_TIMING.fmWinDelayMs));
            }
            break;
          case 'TIME_UP':
          case 'ALL_ANSWERED':
            steps.push(step('ff_fm_done'));
            break;
          case 'FAST_MONEY_DONE':
            if (inner.won && !jackpotCued) {
              jackpotCued = true;
              steps.push(step('ff_fm_win'));
            } else if (!inner.won) {
              steps.push(step('ff_crowd_aww'));
            }
            break;
          default:
            break;
        }
        break;
      }
      case 'GAME_OVER':
        // The jackpot fanfare already has a cheering audience in it.
        if (!jackpotCued) steps.push(step('applause'));
        break;
      default:
        break;
    }
  }
  return { steps, flags: { jackpotCued } };
};

/** Events that restart the host-only answer timer, and how long it holds first. */
export const ANSWER_TIMER_EVENTS: ReadonlySet<FeudEvent['type']> = new Set([
  'BUZZED',
  'BUZZER_ASSIGNED',
  'FACEOFF_X',
  'ANSWER_REVEALED',
  'STRIKE',
  'REPEAT',
  'DOWN_THE_LINE',
  'CONTROL_CHOSEN',
  'SURVEY_REPLACED',
  'ROUND_STARTED',
  'UNDONE',
]);

/** Hold before the answer timer runs after these events (HOST_FEATURE_INVENTORY.md 2.7). */
export const holdAfter = (events: readonly FeudEvent[], next: FeudState): number => {
  let hold = 0;
  for (const event of events) {
    if (event.type === 'FACEOFF_X' && next.faceOff?.stage === 'second-answer') {
      hold = Math.max(hold, FEUD_TIMING.firstMissHoldMs);
    } else if (
      event.type === 'FACEOFF_X' ||
      event.type === 'ANSWER_REVEALED' ||
      event.type === 'STRIKE' ||
      event.type === 'REPEAT' ||
      event.type === 'DOWN_THE_LINE'
    ) {
      hold = Math.max(hold, FEUD_TIMING.rulingHoldMs);
    }
  }
  return hold;
};
