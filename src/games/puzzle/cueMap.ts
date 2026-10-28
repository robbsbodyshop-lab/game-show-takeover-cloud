/** Which cues a presentation event plays. Pure, so the mapping is testable without audio. */
import type { Mode, PuzzleEvent } from '@/engines/puzzle';
import { cascadeCue } from './cues';
import type { PuzzleCue } from './cues';

export const cuesForEvent = (event: PuzzleEvent, mode: Mode): PuzzleCue[] => {
  switch (event.type) {
    case 'spawn':
      return [];
    // Gravity steps are silent; only the player's own moves click.
    case 'move':
      return event.auto ? [] : ['puzzle-move'];
    case 'rotate':
      return ['puzzle-rotate'];
    case 'lock':
      return ['puzzle-lock'];
    case 'fall':
      return ['puzzle-fall'];
    case 'clear':
      return ['puzzle-clear'];
    case 'cascade':
      return [cascadeCue(event.index)];
    case 'germ-cleared':
      return ['puzzle-germ-clear'];
    case 'level-clear':
      return ['puzzle-level-clear'];
    case 'top-out':
      return ['puzzle-top-out'];
    case 'garbage-sent':
      return ['puzzle-garbage-send'];
    case 'garbage-received':
      return ['puzzle-garbage-land'];
    // In 1P the level-clear cue already covers the round.
    case 'round-won':
      return mode === '2p' ? ['puzzle-round-win'] : [];
    case 'match-won':
      return ['puzzle-match-win'];
    case 'paused':
      return ['puzzle-pause'];
    case 'resumed':
      return ['puzzle-resume'];
  }
};
