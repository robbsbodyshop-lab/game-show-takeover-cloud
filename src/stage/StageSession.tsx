import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useAppServices } from '@/app/AppContext';
import type { AuthUser, EventRecord } from '@/data';
import { eventReducer, isGamePlaying, type EventAction, type EventSession } from '@/engines/event';
import { AuthScreen } from './AuthScreen';
import type { GameCallbacks } from './GameSlot';
import { useGameSettingGroups } from '@/host/useGameSettingGroups';
import {
  IDLE_PHONE_CONTROLS,
  type GameEndReport,
  type GameSettingsBundle,
  type GameSettingsGroup,
} from './gameContract';
import { SettingsForm } from './SettingsForm';
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
 * Director lease (design.md TD-002): the stage runtime claims the event's lease on mount and renews it
 * every 10 s. A refused claim (another stage is running this event) makes this tab read-only within
 * seconds: dispatch ignored, nothing saved, no room, no transport. A failed compare-and-set save is the
 * second line of defence: it proves another stage saved first and demotes this one the same way.
 * "Reload this event" remounts the stage, which loads the director's latest state and claims again.
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
  const readOnlyRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [dialog, setDialog] = useState<StageDialog | null>(null);
  const [hostDrawerOpen, setHostDrawerOpen] = useState(false);
  const { settings, update, reload: reloadAppSettings } = useStageSettings(audio, data);
  const gameGroups = useGameSettingGroups(data);
  const { feud, wheel, save: saveGameGroup, reload: reloadGameGroups } = gameGroups;

  const dispatch = useCallback((action: EventAction): void => {
    if (!readOnlyRef.current) rawDispatch(action);
  }, []);

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
  const { snapshot: runtime, demote } = useStageRuntime({
    eventId: event.id,
    userId: user.id,
    data,
    createTransport,
    teams,
    audience,
  });
  const { phones, channel } = runtime;
  const readOnly = runtime.lease === 'readonly';
  useEffect(() => {
    readOnlyRef.current = readOnly;
  }, [readOnly]);

  const { saveFailing } = useSessionPersistence({
    data,
    eventId: event.id,
    session,
    initialRev,
    saveOnMount,
    enabled: runtime.lease === 'director',
    onConflict: () => {
      readOnlyRef.current = true;
      demote();
    },
  });

  const inputLocked = paused || dialog !== null || readOnly;

  // What the running game gets: the saved rules, with Feud's voice and answer source taken from `app`.
  const { voice, answersFrom } = settings;
  const gameSettings = useMemo<GameSettingsBundle>(
    () => ({ feud: { ...feud, voice, answersFrom }, wheel, app: { voice, answersFrom } }),
    [feud, wheel, voice, answersFrom],
  );
  const nextGameSettings = useMemo(() => ({ feud, wheel }), [feud, wheel]);
  const onSaveSettings = useCallback(
    (group: GameSettingsGroup, value: unknown): void => {
      saveGameGroup(group, value);
    },
    [saveGameGroup],
  );
  const settingsChanged = useCallback((): void => {
    reloadAppSettings();
    reloadGameGroups();
  }, [reloadAppSettings, reloadGameGroups]);

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
      settingsChanged,
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

  const closeHostDrawer = useCallback(() => {
    setHostDrawerOpen(false);
  }, []);

  const newEvent = useCallback((): void => {
    dispatch({ type: 'NEW_EVENT' });
  }, [dispatch]);

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
        gameSettings={gameSettings}
        onSaveSettings={onSaveSettings}
        paused={paused}
        inputLocked={inputLocked}
        showMode={settings.showMode}
        musicOn={settings.musicOn}
        hostDrawerOpen={hostDrawerOpen}
        hostChannel={channel}
        hostDrawerSettings={
          <SettingsForm
            phase={session.phase}
            settings={settings}
            onChange={update}
            gameSettings={nextGameSettings}
            onSaveGameSettings={saveGameGroup}
            onResetScores={resetScores}
            onNewEvent={newEvent}
            onBackToEvents={exit}
            onSignOut={onSignOut}
          />
        }
        onCloseHostDrawer={closeHostDrawer}
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
        gameSettings={nextGameSettings}
        onSaveGameSettings={saveGameGroup}
        onClose={closeDialog}
        onResetScores={() => {
          resetScores();
          closeDialog();
        }}
        onNewEvent={() => {
          newEvent();
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
