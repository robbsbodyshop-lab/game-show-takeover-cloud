import type { AudioPlayer } from '@/audio/player';
import type { EventAction, EventSession } from '@/engines/event';
import type { HostBridge } from '@/host/hostProtocol';
import type { ConnectionStatus, PresenceEntry } from '@/realtime';
import { BracketScreen } from './BracketScreen';
import { DoorSelection } from './DoorSelection';
import { GameSlot, type GameCallbacks } from './GameSlot';
import type { PhoneBridge } from './gameContract';
import { HubScreen } from './HubScreen';
import { PhaseStub } from './PhaseStub';
import type { EventScreenKind, StageRegistry } from './screenContract';
import { SetupScreen } from './SetupScreen';
import type { StageDialog } from './stageDialog';

export interface PhaseRouterProps {
  eventName: string;
  session: EventSession;
  dispatch: (action: EventAction) => void;
  registry: StageRegistry;
  origin: string;
  roomCode: string | null;
  status: ConnectionStatus;
  roomError: string | null;
  roster: readonly PresenceEntry[];
  inputLocked: boolean;
  showMode: boolean;
  audio: AudioPlayer;
  phones: PhoneBridge | null;
  host: HostBridge | null;
  callbacks: GameCallbacks;
  draw: () => number;
  now: () => number;
  onBackToHub: () => void;
  onOpenDialog: (dialog: StageDialog) => void;
  onExitEvent: () => void;
}

const SCREEN_TITLES: Record<EventScreenKind, string> = {
  speed: 'Speed Round',
  plinko: 'Final Plinko',
  puzzle: 'Puzzle Game',
  winner: 'Announce the Winner',
};

/** Chooses the screen for the event phase (design.md §6: `src/stage` is the phase router). */
export const PhaseRouter = (props: PhaseRouterProps) => {
  const { session, dispatch, registry } = props;

  switch (session.phase) {
    case 'setup':
      return (
        <SetupScreen
          // A new event (same component, fresh teams) restarts the editor from the session.
          key={session.gameInstance}
          eventName={props.eventName}
          session={session}
          dispatch={dispatch}
          roomCode={props.roomCode}
          origin={props.origin}
          status={props.status}
          roomError={props.roomError}
          roster={props.roster}
          showMode={props.showMode}
          onOpenSettings={() => {
            props.onOpenDialog('settings');
          }}
          onExitEvent={props.onExitEvent}
        />
      );
    case 'doors':
      return <DoorSelection session={session} dispatch={dispatch} draw={props.draw} />;
    case 'hub':
      return (
        <HubScreen
          eventName={props.eventName}
          session={session}
          dispatch={dispatch}
          draw={props.draw}
          onOpenDialog={props.onOpenDialog}
        />
      );
    case 'feud':
    case 'wheel': {
      if (session.game === null) {
        return session.phase === 'feud' ? (
          <BracketScreen
            session={session}
            dispatch={dispatch}
            draw={props.draw}
            onBackToHub={props.onBackToHub}
          />
        ) : (
          <PhaseStub phase={session.phase} onBackToHub={props.onBackToHub} />
        );
      }
      if (props.phones === null || props.host === null) return null;
      return (
        <GameSlot
          key={`${session.phase}-${String(session.gameInstance)}`}
          kind={session.phase}
          session={session}
          callbacks={props.callbacks}
          inputLocked={props.inputLocked}
          showMode={props.showMode}
          audio={props.audio}
          phones={props.phones}
          host={props.host}
          registry={registry}
        />
      );
    }
    case 'speed':
    case 'plinko':
    case 'puzzle':
    case 'winner': {
      const Screen = registry.screens?.[session.phase];
      // TODO(wire): register the real screens in the `screens` registry passed to <StageApp>
      // (speed: src/games/speed, plinko: src/games/plinko, winner: src/games/winner, puzzle: T24).
      if (!Screen) {
        return <PhaseStub phase={SCREEN_TITLES[session.phase]} onBackToHub={props.onBackToHub} />;
      }
      return (
        <Screen
          session={session}
          dispatch={dispatch}
          inputLocked={props.inputLocked}
          showMode={props.showMode}
          audio={props.audio}
          draw={props.draw}
          now={props.now}
          onBackToHub={props.onBackToHub}
        />
      );
    }
  }
};
