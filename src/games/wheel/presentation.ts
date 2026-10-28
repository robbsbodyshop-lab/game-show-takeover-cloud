/** Pure text the stage shows next to the engine state: button labels and the vowel notices. */
import { consonantsRemaining, vowelsRemaining } from '@/engines/wheel/puzzleState';
import type { Segment, WheelState } from '@/engines/wheel/types';

function labelForSegment(seg: Segment | undefined): string {
  if (!seg) return 'Final results';
  switch (seg.kind) {
    case 'round':
      return seg.prize ? 'On to Round 3: the Prize Puzzle' : `On to Round ${String(seg.round)}`;
    case 'triple':
      return 'On to the Triple Toss-Up';
    case 'tossup':
      return seg.starter ? 'On to the $2,000 toss-up' : 'On to the next toss-up';
    case 'frenzy':
      return 'On to Fortune Frenzy';
    case 'speedup':
      return 'On to the Speed-Up';
    case 'tiebreak':
      return 'On to the tiebreaker';
    case 'bonus':
      return 'On to the Bonus Round';
    case 'finale':
      return 'Final results';
  }
}

/** What the "keep going" button says in the current phase, or null when there is nothing to continue. */
export function continueLabel(s: WheelState): string | null {
  switch (s.phase) {
    case 'tossup-done':
      if (s.stage === 'triple' && (s.triple?.index ?? 2) < 2) return 'Next puzzle';
      return labelForSegment(s.plan[s.planIndex + 1]);
    case 'round-award':
      return labelForSegment(s.plan[s.planIndex + 1]);
    case 'bonus-ready':
      return 'Start the 10 second clock';
    case 'bonus-opened':
      return 'Final results';
    case 'done':
      return 'Continue to the hub';
    default:
      return null;
  }
}

/** "NO MORE VOWELS" / "ONLY VOWELS REMAIN" for the category strip (never names a letter). */
export function vowelNotice(s: WheelState): string | null {
  const ps = s.puzzle;
  if (!ps || (s.stage !== 'round' && s.stage !== 'speedup')) return null;
  if (s.phase === 'round-award' || s.phase === 'awaiting-puzzles') return null;
  const vowels = vowelsRemaining(ps);
  const consonants = consonantsRemaining(ps);
  if (consonants === 0 && vowels > 0) return 'ONLY VOWELS REMAIN';
  if (vowels === 0 && consonants > 0 && ps.called.length > 0) return 'NO MORE VOWELS';
  return null;
}
