import { useState } from 'react';
import type { AudioPlayer } from '@/audio/player';
import type { EventSession, MainGameKind } from '@/engines/event';
import type { HostBridge } from '@/host/hostProtocol';
import type { GameEndReport, PhoneBridge } from './gameContract';
import { PhaseStub } from './PhaseStub';
import type { StageRegistry } from './screenContract';

/** The stage-side callbacks a game gets; stable between renders so a game may keep them in effects. */
export interface GameCallbacks {
  onContentUsed: (ids: string[]) => void;
  onStateChange: (state: unknown) => void;
  onGameEnd: (report: GameEndReport) => void;
  onQuitToHub: () => void;
}

export interface GameSlotProps {
  kind: MainGameKind;
  session: EventSession;
  callbacks: GameCallbacks;
  inputLocked: boolean;
  showMode: boolean;
  audio: AudioPlayer;
  phones: PhoneBridge;
  host: HostBridge;
  registry: StageRegistry;
}

/**
 * Mounts a main game (Family Feud, Wheel) with its `GameProps` (design.md §7): the engine snapshot
 * saved by a previous session is handed over once as `initialState`; the stage persists whatever the
 * game reports through `onStateChange`. Remounted per `gameInstance` by the caller (via `key`).
 */
export const GameSlot = ({
  kind,
  session,
  callbacks,
  inputLocked,
  showMode,
  audio,
  phones,
  host,
  registry,
}: GameSlotProps) => {
  // Captured once: later snapshots come from the game itself and must not feed back into it.
  const [initialState] = useState<unknown>(() => session.game?.state ?? undefined);
  const Game = registry.games?.[kind];

  // TODO(wire): register the real game components in the `games` registry passed to <StageApp>
  // (feud: src/games/feud FeudGame; wheel: src/games/wheel WheelGame). Until then: a stub.
  if (!Game) return <PhaseStub phase={kind} onBackToHub={callbacks.onQuitToHub} />;

  return (
    <Game
      teams={session.teams}
      playOrder={session.playOrder}
      usedContentIds={session.usedContentIds}
      onContentUsed={callbacks.onContentUsed}
      inputLocked={inputLocked}
      showMode={showMode}
      initialState={initialState}
      onStateChange={callbacks.onStateChange}
      onGameEnd={callbacks.onGameEnd}
      onQuitToHub={callbacks.onQuitToHub}
      audio={audio}
      phones={phones}
      host={host}
      gameInstance={session.gameInstance}
    />
  );
};
