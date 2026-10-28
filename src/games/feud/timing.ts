/**
 * Presentation timing for the Family Feud controller (docs/reference/HOST_FEATURE_INVENTORY.md 5.3
 * and 2.7; docs/reference/AUDIO_CUES_V1.md). All values are milliseconds.
 */
import { COMMAND_REPEAT_WINDOW_MS } from '@/host/hostProtocol';

export const FEUD_TIMING = {
  /** "Survey says..." beat between a judged answer and the flip (or X). */
  surveySaysMs: 1100,
  /** The answer timer holds this long after a ruling (strike, reveal, repeat). */
  rulingHoldMs: 1200,
  /** ...and this long after the first face-off miss. */
  firstMissHoldMs: 4000,
  /** `ff_time_warn` ticks when this much of the answer timer is left. */
  timeWarnAtMs: 1000,
  /** The cheer follows a revealed answer; the aww follows every X. */
  cheerDelayMs: 450,
  awwDelayMs: 500,
  /** The round sting comes after the applause of a won round. */
  roundStingAfterWinMs: 2200,
  /** The jackpot fanfare follows the SURVEY SAID step that reached 200. */
  fmWinDelayMs: 600,
  /** How long the big red X stays up. */
  strikeOverlayMs: 1500,
  /** Fast Money clock tick; the controller credits the real elapsed time. */
  fmTickMs: 100,
  /** Gap between the steps of "Reveal all" in Fast Money. */
  fmRevealStepMs: 900,
  /** While the clock ticks, persistence is throttled to this. */
  persistTickMs: 1000,
  /** Typing or speaking holds the answer timer this long after the last keystroke. */
  typingHoldMs: 3000,
  /** A mic session that ends within this window counts as a quick end. */
  voiceRestartWindowMs: 1000,
  /** Quick self-ended sessions restarted in a row before the mic gives up. */
  voiceMaxRestarts: 3,
  /** A command repeating within this window counts once. */
  repeatDropMs: COMMAND_REPEAT_WINDOW_MS,
  /** Two-tap confirmations disarm after this long. */
  confirmWindowMs: 4000,
  /** How many phone press ids are remembered to ignore retries. */
  phoneDedupe: 24,
} as const;
