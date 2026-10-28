import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useAppServices } from '@/app/AppContext';
import type { AuthUser, EventRecord } from '@/data';
import { eventReducer, isGamePlaying, type EventAction, type EventSession } from '@/engines/event';
import { AuthScreen } from './AuthScreen';
import type { GameCallbacks } from './GameSlot';
import { IDLE_PHONE_CONTROLS, type GameEndReport } from './gameContract';
import { LockFlag, lockHostBridge } from './lockedHostBridge';
import type { StageRegistry } from './screenContract';
import type { StageDialog } from './stageDialog';
import { StageDialogs } from './StageDialogs';
import { StageView } from './StageView';
import { useHotkeys } from './hotkeys';
import { useHubChannel } from './useHubChannel';
import { useSessionPersistence } from './useSessionPersistence';
import { useSpeedClockLock } from './useSpeedClockLock';
import { useStageAudio } from './useStageAudio';
import { useStageRuntime } from './useStageRuntime';
import { useStageSettings } from './useStageSettings';
import styles from './StageSession.module.css';

export interface StageSessionProps extends StageRegistry {
  event: EventRecord;
  user: AuthUser;
  /** The session this stage starts from (the cloud copy, the cache, or a fresh one). */
  initial: EventSession;
  /** Revision of the cloud copy when `initial` was chosen. */
  initialRev: number;
  /** Save `initial` right away (cache newer than the cloud, or the host started a new event). */
  saveOnMount: boolean;
  signedOut: boolean;
  draw: () => number;
  now: () => number;
  onExit: (finished: boolean) => void;
  onSignOut: () => void;
  /** Throw this stage away and load the event again (after losing the director lease). */
  onReload: () => void;
}

/**
 * Owns the event for one open stage: `useReducer(eventReducer)`, saving, the room and its transport,
 * the phone and host bridges, pause, dialogs, hotkeys, and the settings. Rendering is `StageView`.
 *
 * Director lease (design.md TD-002): a failed compare-and-set save means another stage saved first;
 * this stage then turns read-only (dispatch ignored, transport closed) and says so. The EventRepo has
 * no `director_session` heartbeat yet, so a second stage is only noticed at its first save.
 */
export const StageSession = ({
  event,
  user,
  initial,
  initialRev,
  saveOnMount,
  signedOut,
  draw,
  now,
  onExit,
  onSignOut,
  onReload,
  games,
  screens,
}: StageSessionProps) => {
  const { data, audio, createTransport, version } = useAppServices();
  const registry = useMemo<StageRegistry>(() => ({ games, screens }), [games, screens]);
  const [session, rawDispatch] = useReducer(eventReducer, initial);
  const [readOnly, setReadOnly] = useState(false);
  const readOnlyRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [dialog, setDialog] = useState<StageDialog | null>(null);
  const [hostDrawerOpen, setHostDrawerOpen] = useState(false);
  const { settings, update } = useStageSettings(audio);

  const dispatch = useCallback((action: EventAction): void => {
    if (!readOnlyRef.current) rawDispatch(action);
  }, []);

  const { saveFailing } = useSessionPersistence({
    data,
    eventId: event.id,
    session,
    initialRev,
    saveOnMount,
    onConflict: () => {
      readOnlyRef.current = true;
      setReadOnly(true);
    },
  });

  const inputLocked = paused || dialog !== null || readOnly;

  const teams = useMemo(
    () => session.teams.map(({ id, name, color }) => ({ id, name, color })),
    [session.teams],
  );
  const audience = useMemo(
    () => ({
      phase: session.phase,
      paused,
      scores: session.teams.map((t) => ({ team: t.id, score: t.score })),
    }),
    [session.phase, session.teams, paused],
  );
  const runtime = useStageRuntime({
    eventId: event.id,
    userId: user.id,
    data,
    createTransport,
    teams,
    audience,
    enabled: !readOnly,
  });
  const { phones, channel } = runtime;

  // Phone presses and host commands are refused while locked (FR-015).
  const [lock] = useState(() => new LockFlag());
  useEffect(() => {
    lock.set(inputLocked);
    phones?.setLocked(inputLocked);
  }, [lock, inputLocked, phones]);
  const host = useMemo(() => (channel ? lockHostBridge(channel.bridge, lock) : null), [channel, lock]);

  const backToHub = useCallback((): void => {
    switch (session.phase) {
      case 'feud':
      case 'wheel':
        dispatch({ type: 'ABANDON_GAME' });
        return;
      case 'plinko':
        dispatch({ type: 'END_PLINKO' });
        return;
      case 'speed':
      case 'puzzle':
      case 'winner':
        dispatch({ type: 'GO_HUB' });
        return;
      default:
    }
  }, [session.phase, dispatch]);

  const gameInstance = session.gameInstance;
  const callbacks = useMemo<GameCallbacks>(
    () => ({
      onContentUsed: (ids) => {
        dispatch({ type: 'CONTENT_USED', ids });
      },
      onStateChange: (state) => {
        dispatch({ type: 'GAME_STATE', state });
      },
      onGameEnd: (report: GameEndReport) => {
        dispatch({
          type: 'GAME_WON',
          winnerId: report.winnerId,
          roundScore: report.roundScore,
          ...(report.extraScores ? { extraScores: report.extraScores } : {}),
          ...(report.bonusChips === undefined ? {} : { bonusChips: report.bonusChips }),
          gameInstance,
        });
      },
      onQuitToHub: backToHub,
    }),
    [dispatch, backToHub, gameInstance],
  );

  const resetScores = useCallback((): boolean => {
    if (session.phase === 'setup') return false;
    dispatch({ type: 'RESET_SCORES' });
    return true;
  }, [session.phase, dispatch]);

  useHubChannel({
    channel,
    data: {
      session,
      paused,
      showMode: settings.showMode,
      dialogOpen: dialog !== null,
      roomCode: runtime.code,
      status: runtime.status,
      roster: runtime.roster,
    },
    inputLocked,
    commands: {
      setPaused,
      setShowMode: (on) => {
        update({ showMode: on });
      },
      quitGame: () => {
        if (session.phase === 'setup' || session.phase === 'doors' || session.phase === 'hub') return false;
        backToHub();
        return true;
      },
      resetScores,
      buzz: (team) => phones?.injectPress(team) ?? 'unknown-team',
    },
  });

  useHotkeys(
    { paused, dialogOpen: dialog !== null },
    {
      toggleHostDrawer: () => {
        setHostDrawerOpen((open) => !open);
      },
      togglePause: () => {
        setPaused((p) => !p);
      },
      resume: () => {
        setPaused(false);
      },
      toggleShowMode: () => {
        update({ showMode: !settings.showMode });
      },
      buzz: (team) => {
        phones?.injectPress(team);
      },
    },
  );

  useStageAudio({
    audio,
    hubMusic: session.phase === 'hub' && settings.musicOn,
    locked: paused || dialog !== null,
  });
  useSpeedClockLock(session, inputLocked, dispatch, now);

  const closeDialog = useCallback(() => {
    setDialog(null);
  }, []);

  const exit = useCallback((): void => {
    setDialog(null);
    onExit(session.phase === 'winner');
  }, [onExit, session.phase]);

  const gameRunning = isGamePlaying(session);

  // Outside a game nobody owns the phone controls: say "off", and clear whatever a finished game left.
  useEffect(() => {
    if (!gameRunning) phones?.publishControls(IDLE_PHONE_CONTROLS);
  }, [phones, gameRunning]);

  return (
    <>
      <StageView
        eventName={event.name}
        session={session}
        dispatch={dispatch}
        registry={registry}
        origin={window.location.origin}
        roomCode={runtime.code}
        status={runtime.status}
        roomError={runtime.error}
        roster={runtime.roster}
        audio={audio}
        phones={phones}
        host={host}
        callbacks={callbacks}
        paused={paused}
        inputLocked={inputLocked}
        showMode={settings.showMode}
        musicOn={settings.musicOn}
        hostDrawerOpen={hostDrawerOpen}
        readOnly={readOnly}
        signedOut={signedOut}
        saveFailing={saveFailing}
        draw={draw}
        now={now}
        onTogglePause={() => {
          setPaused((p) => !p);
        }}
        onToggleMusic={() => {
          update({ musicOn: !settings.musicOn });
        }}
        onToggleShowMode={() => {
          update({ showMode: !settings.showMode });
        }}
        onOpenDialog={setDialog}
        onBackToHub={backToHub}
        onExitEvent={exit}
        onReload={onReload}
      />
      <StageDialogs
        dialog={dialog}
        session={session}
        dispatch={dispatch}
        settings={settings}
        version={version}
        onSettings={update}
        onClose={closeDialog}
        onResetScores={() => {
          resetScores();
          closeDialog();
        }}
        onNewEvent={() => {
          dispatch({ type: 'NEW_EVENT' });
          closeDialog();
        }}
        onBackToEvents={exit}
        onSignOut={onSignOut}
      />
      {signedOut && !gameRunning ? (
        <div className={styles.reauth} data-testid="reauth">
          <AuthScreen auth={data.auth} />
        </div>
      ) : null}
    </>
  );
};
