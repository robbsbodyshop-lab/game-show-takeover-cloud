/**
 * Plug points for the screens the stage renders but does not own. The stage passes these registries
 * down from `StageApp`; an entry that is missing falls back to `PhaseStub`, so the event flow works
 * before the real screens are wired in.
 */
import type { ComponentType } from 'react';
import type { AudioPlayer } from '@/audio/player';
import type { EventAction, EventSession, MainGameKind } from '@/engines/event';
import type { GameProps } from './gameContract';

/** Finale and filler screens that run on the event engine itself (no GameProps). */
export type EventScreenKind = 'speed' | 'plinko' | 'puzzle' | 'winner';

export interface EventScreenProps {
  session: EventSession;
  dispatch: (action: EventAction) => void;
  /** True while paused (F8), any dialog is open, or this stage is read-only. */
  inputLocked: boolean;
  showMode: boolean;
  audio: AudioPlayer;
  /** Injected randomness in [0, 1) (Plinko draws). */
  draw: () => number;
  /** Injected clock (Speed Round actions carry `now`). */
  now: () => number;
  /** Back to the hub: the stage already handled any confirmation. */
  onBackToHub: () => void;
}

export interface StageRegistry {
  games?: Partial<Record<MainGameKind, ComponentType<GameProps>>>;
  screens?: Partial<Record<EventScreenKind, ComponentType<EventScreenProps>>>;
}

export const DEFAULT_REGISTRY: StageRegistry = {};
