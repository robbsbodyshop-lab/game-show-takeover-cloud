import type { BracketState } from '@/engines/event/types';
import type { GameProps } from '@/stage/gameContract';
import type { FeudMatch } from './FeudController';
import type { FeudRuntime } from './runtime';
import type { FeudSettings } from './settings';

/** What the stage hands the Feud game: the shared contract plus the match, bracket and settings. */
export interface FeudGameProps extends GameProps {
  settings?: Partial<FeudSettings>;
  /** The two teams of this match; defaults to the bracket's current match, then the play order. */
  match?: FeudMatch;
  bracket?: BracketState | null;
  /** Test seams: time, timers, rng, content, microphone and voice. */
  runtime?: Partial<FeudRuntime>;
}

/** Runs a host action (the same names the host view sends as commands). */
export type RunCommand = (name: string, args?: Record<string, unknown>) => void;
