import type { CSSProperties, ReactNode } from 'react';
import type { AudioPlayer } from '@/audio/player';
import { Stage } from '@/design';
import type { EventAction, EventSession } from '@/engines/event';
import type { HostBridge } from '@/host/hostProtocol';
import type { ConnectionStatus, PresenceEntry } from '@/realtime';
import { ErrorBoundary } from './ErrorBoundary';
import type { GameCallbacks } from './GameSlot';
import type { StageHostChannel } from './hostChannelAdapter';
import type { PhoneBridge } from './gameContract';
import { PauseCard } from './PauseCard';
import { PhaseRouter } from './PhaseRouter';
import { Scoreboard } from './Scoreboard';
import type { StageRegistry } from './screenContract';
import type { StageDialog } from './stageDialog';
import { StageHostDrawer } from './StageHostDrawer';
import { StatusBanners } from './StatusBanners';
import { useIdleCursor } from './useIdleCursor';
import styles from './StageView.module.css';

export interface StageViewProps {
  eventName: string;
  session: EventSession;
  dispatch: (action: EventAction) => void;
  registry: StageRegistry;
  origin: string;
  roomCode: string | null;
  status: ConnectionStatus;
  roomError: string | null;
  roster: readonly PresenceEntry[];
  audio: AudioPlayer;
  phones: PhoneBridge | null;
  host: HostBridge | null;
  callbacks: GameCallbacks;
  paused: boolean;
  inputLocked: boolean;
  showMode: boolean;
  musicOn: boolean;
  /** F2 flag for the host drawer (T11). */
  hostDrawerOpen: boolean;
  /** The stage's own host channel; the drawer reads snapshots from it and sends commands into it. */
  hostChannel: StageHostChannel | null;
  /** The drawer's Settings tab (the same form as the Settings dialog). */
  hostDrawerSettings: ReactNode;
  onCloseHostDrawer: () => void;
  readOnly: boolean;
  signedOut: boolean;
  saveFailing: boolean;
  draw: () => number;
  now: () => number;
  onTogglePause: () => void;
  onToggleMusic: () => void;
  onToggleShowMode: () => void;
  onOpenDialog: (dialog: StageDialog) => void;
  onBackToHub: () => void;
  onExitEvent: () => void;
  onReload: () => void;
}

/** Phases whose screens draw their own full-width layout, without the sidebar (setup has its own buttons). */
const FULL_WIDTH = new Set(['setup']);

/** The 1920x1080 stage: the phase screen, the sidebar scoreboard, the pause card and the banners. */
export const StageView = (props: StageViewProps) => {
  const { session, showMode, paused } = props;
  const idle = useIdleCursor(showMode);
  const sidebar = !showMode && !FULL_WIDTH.has(session.phase);

  return (
    <Stage>
      <div
        className={styles.root}
        data-show-mode={showMode}
        data-idle={idle}
        data-host-drawer={props.hostDrawerOpen}
        data-testid="stage-root"
        style={{ '--sidebar-w': '420px' } as CSSProperties}
      >
        <div className={styles.main}>
          <ErrorBoundary recoverLabel="Back to hub" onRecover={props.onBackToHub}>
            <PhaseRouter
              eventName={props.eventName}
              session={session}
              dispatch={props.dispatch}
              registry={props.registry}
              origin={props.origin}
              roomCode={props.roomCode}
              status={props.status}
              roomError={props.roomError}
              roster={props.roster}
              inputLocked={props.inputLocked}
              showMode={showMode}
              audio={props.audio}
              phones={props.phones}
              host={props.host}
              callbacks={props.callbacks}
              draw={props.draw}
              now={props.now}
              onBackToHub={props.onBackToHub}
              onOpenDialog={props.onOpenDialog}
              onExitEvent={props.onExitEvent}
            />
          </ErrorBoundary>
        </div>
        {sidebar ? (
          <Scoreboard
            session={session}
            roomCode={props.roomCode}
            origin={props.origin}
            paused={paused}
            musicOn={props.musicOn}
            onScore={(team, delta) => {
              props.dispatch({ type: 'SCORE_CHANGE', team, delta });
            }}
            onChips={(team, delta) => {
              props.dispatch({ type: 'CHIP_CHANGE', team, delta });
            }}
            onTogglePause={props.onTogglePause}
            onToggleMusic={props.onToggleMusic}
            onShowMode={props.onToggleShowMode}
            onOpenSettings={() => {
              props.onOpenDialog('settings');
            }}
            onAbandon={props.onBackToHub}
            onBackToHub={props.onBackToHub}
          />
        ) : null}
        <StageHostDrawer
          channel={props.hostChannel}
          open={props.hostDrawerOpen}
          onClose={props.onCloseHostDrawer}
          settings={props.hostDrawerSettings}
        />
        <StatusBanners
          readOnly={props.readOnly}
          onReload={props.onReload}
          signedOut={props.signedOut}
          saveFailing={props.saveFailing}
          reconnecting={props.status === 'reconnecting'}
          showMode={showMode}
        />
        {paused ? <PauseCard showMode={showMode} onResume={props.onTogglePause} /> : null}
      </div>
    </Stage>
  );
};
