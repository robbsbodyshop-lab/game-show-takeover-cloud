/**
 * Engine events to audio cues, following docs/reference/AUDIO_CUES_V1.md (Wheel of Fortune table and
 * "Delayed cues"). Pure: the controller plays what this returns, waiting `delayMs` first and dropping
 * a cue that is still waiting when an Undo, a thrown-out puzzle or a host override lands (the doc's
 * rule, so a ruling that was taken back never plays its sound).
 */
import type { SoundName } from '@/audio/cues';
import { consonantsRemaining, vowelsRemaining } from '@/engines/wheel/puzzleState';
import type { WheelEvent, WheelState } from '@/engines/wheel/types';

export const APPLAUSE_DELAY_MS = 700;
export const STING_DELAY_MS = 500;
export const BANKRUPT_AFTER_BUZZER_MS = 900;
export const BANKRUPT_AFTER_ROLL_MS = 1800;
export const SAME_LETTER_DELAY_MS = 600;
export const FINAL_SPIN_AFTER_BELL_MS = 1600;
export const GAME_OVER_DELAY_MS = 800;
export const VOWEL_NOTICE_DELAY_MS = 700;
export const BUZZER_AFTER_VOWEL_MS = 350;

export interface CuePlay {
  cue: SoundName;
  /** Wait this long before playing; 0 plays at once. */
  delayMs: number;
  overlap?: boolean;
}

const now = (cue: SoundName): CuePlay => ({ cue, delayMs: 0 });
const later = (cue: SoundName, delayMs: number): CuePlay => ({ cue, delayMs });

function isPrizeRound(state: WheelState): boolean {
  const seg = state.plan[state.planIndex];
  return state.stage === 'round' && seg?.kind === 'round' && seg.prize;
}

/** The cues for one batch of events (everything one dispatch emitted), `state` being the result. */
export function cuesFor(events: readonly WheelEvent[], state: WheelState): CuePlay[] {
  const out: CuePlay[] = [];
  const types = events.map((e) => e.type);
  events.forEach((ev, i) => {
    const before = types.slice(0, i);
    switch (ev.type) {
      case 'puzzle':
        // Frenzy swaps puzzles fast under its own bed; only the first one gets the chime.
        if (state.stage === 'frenzy' && (state.frenzy?.solved ?? 0) > 0) break;
        out.push(now(isPrizeRound(state) ? 'wof_prize_chime' : 'wof_category_chime'));
        break;
      case 'segment':
        if (ev.label === 'speedup') out.push(now('wof_final_spin'));
        break;
      case 'buzz':
        out.push(now('wof_ring_in'));
        break;
      case 'tossup-correct': {
        const tripleLeadIn = state.stage === 'triple' && (state.triple?.index ?? 2) < 2;
        out.push(now(state.stage === 'frenzy' || tripleLeadIn ? 'wof_triple_ding' : 'wof_tossup_solve'));
        break;
      }
      case 'tossup-wrong':
      case 'letter-miss':
      case 'letter-repeat':
      case 'time-out':
      case 'solve-wrong':
      case 'bonus-wrong':
        out.push(
          ev.type !== 'tossup-wrong' && before.includes('vowel-bought')
            ? later('wheel_buzzer', BUZZER_AFTER_VOWEL_MS)
            : now('wheel_buzzer'),
        );
        break;
      case 'tossup-filled':
      case 'frenzy-end':
      case 'round-unsolved':
      case 'bonus-time-up':
        out.push(now('wof_time_up'));
        break;
      case 'sweep':
        out.push(later('applause', APPLAUSE_DELAY_MS));
        break;
      case 'spin':
        if (ev.label === 'mystery') out.push(now('wof_mystery'));
        else if (ev.label === 'express') out.push(now('wof_express'));
        break;
      case 'bankrupt': {
        if (before.includes('mystery-flip')) out.push(later('wof_bankrupt', BANKRUPT_AFTER_ROLL_MS));
        else if (before.some((t) => t === 'letter-miss' || t === 'letter-repeat' || t === 'solve-wrong'))
          out.push(later('wof_bankrupt', BANKRUPT_AFTER_BUZZER_MS));
        else out.push(now('wof_bankrupt'));
        break;
      }
      case 'lose-turn':
        out.push(now('wof_lose_turn'));
        break;
      case 'vowel-bought':
        out.push(now('vowel'));
        break;
      case 'same-letter':
        out.push(later('wheel_letter_ding', SAME_LETTER_DELAY_MS));
        break;
      case 'round-solved':
        out.push(now('wof_solve'));
        // The main game's winner is decided by the Speed-Up solve; the Prize Puzzle wins the trip.
        if (state.award?.speedUp === true || isPrizeRound(state))
          out.push(later('applause', APPLAUSE_DELAY_MS));
        break;
      case 'wild-card-claimed':
        out.push(later('wof_wild_card', STING_DELAY_MS));
        break;
      case 'million-claimed':
        out.push(later('wof_million', STING_DELAY_MS));
        break;
      case 'mystery-flip':
        out.push(now('wof_mystery_flip'));
        if ((ev.amount ?? 0) > 0) out.push(later('applause', BANKRUPT_AFTER_ROLL_MS));
        break;
      case 'bell':
        out.push(now('wof_time_bell'));
        break;
      case 'speedup':
        out.push(
          types.includes('bell') ? later('wof_final_spin', FINAL_SPIN_AFTER_BELL_MS) : now('wof_final_spin'),
        );
        break;
      case 'bonus-category':
        out.push(now('wof_category_chime'));
        break;
      case 'bonus-solved':
        out.push(now('wof_solve'));
        break;
      case 'bonus-opened':
        out.push(now(state.bonus?.won === true ? 'wof_bonus_win' : 'wof_bonus_lose'));
        break;
      case 'game-over':
        out.push(later('winner_fanfare', GAME_OVER_DELAY_MS));
        break;
      default:
        break;
    }
  });
  return out;
}

/** "No more vowels" / "Only vowels remain", from the puzzle before and after a letter was called. */
export function vowelNoticeCue(prev: WheelState, next: WheelState): CuePlay | null {
  const a = prev.puzzle;
  const b = next.puzzle;
  if (a?.puzzle.id !== b?.puzzle.id || !a || !b || next.stage === 'bonus') return null;
  if (next.phase === 'round-award' || next.stage === 'game-over') return null;
  const vowelsBefore = vowelsRemaining(a);
  const vowelsNow = vowelsRemaining(b);
  const consonantsBefore = consonantsRemaining(a);
  const consonantsNow = consonantsRemaining(b);
  if (vowelsBefore > 0 && vowelsNow === 0) return later('wof_no_more_vowels', VOWEL_NOTICE_DELAY_MS);
  if (consonantsBefore > 0 && consonantsNow === 0 && vowelsNow > 0)
    return later('wof_only_vowels', VOWEL_NOTICE_DELAY_MS);
  return null;
}
