/**
 * The phone's live link to the stage (design.md §5, FR-022, FR-023, FR-026). Connects a `phone`
 * transport, keeps the latest `controls`, turns `ack`s into feedback and watches for a silent stage.
 *
 * Phones cannot read presence, so "the stage is gone" is inferred from silence:
 *  - 8 s after connecting with no stage message at all -> `waiting`;
 *  - once the stage has sent an `audience` message (design.md: 1 Hz) it counts as a heartbeat, and
 *    8 s without any stage message -> `waiting` again;
 *  - 2 minutes in `waiting` -> `onGiveUp` (the app returns to the code screen).
 * Any stage message ends `waiting`. Mount this hook under a `key` of room+team so each room starts fresh.
 *
 * The transport joins the phones topic of `team` (`room:<CODE>:phones:<TEAM>`), the only phones
 * topic RLS lets this phone write to (FR-025). `team` is a dependency of the connection effect, so
 * a phone that changes team disconnects and reconnects, which moves it to the new team's topic.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppServices } from '@/app/AppContext';
import type { TeamSummary } from '@/data/types';
import { logger } from '@/lib/logger';
import type { ConnectionStatus, RoomTransport } from '@/realtime/RoomTransport';
import type { PhoneAction } from '@/realtime/schemas';
import type { PhoneControls } from './phoneControls';
import { newPressId } from './pressId';

export const PRESS_INTERVAL_MS = 150;
export const OPTIMISTIC_MS = 1500;
export const FLASH_MS = 1200;
export const STAGE_SILENCE_MS = 8000;
export const GIVE_UP_MS = 2 * 60 * 1000;
export const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
export const NOTE_MS = 2500;
export const VIBRATE_MS = 30;

/** `waiting`: pressed, no answer yet (optimistic). `flash`: the stage accepted the press. */
export type BuzzFeedback = 'idle' | 'waiting' | 'flash';
export type ActionNote = 'sent' | 'refused' | null;

export interface StageLinkParams {
  code: string;
  team: number;
  userId: string;
  nickname: string;
  onTeams: (teams: TeamSummary[]) => void;
  onGiveUp: () => void;
}

export interface StageLink {
  status: ConnectionStatus;
  controls: PhoneControls | null;
  /** True once any stage message arrived on this connection. */
  stageSeen: boolean;
  /** The stage has been silent too long: show "Waiting for the game screen...". */
  waiting: boolean;
  buzz: BuzzFeedback;
  /** Result of the last podium action, for a short status line. */
  note: ActionNote;
  press: () => void;
  sendAction: (action: PhoneAction, answer?: string) => void;
  sendFeudAnswer: (text: string) => void;
  /** Reconnects from scratch after a failed first connection. */
  retry: () => void;
}

const vibrate = (): void => {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(VIBRATE_MS);
  }
};

export function useStageLink(params: StageLinkParams): StageLink {
  const { code, team, userId } = params;
  const { createTransport, data, mode } = useAppServices();

  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [controls, setControls] = useState<PhoneControls | null>(null);
  const [stageSeen, setStageSeen] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [buzz, setBuzz] = useState<BuzzFeedback>('idle');
  const [note, setNote] = useState<ActionNote>(null);
  const [attempt, setAttempt] = useState(0);

  const transportRef = useRef<RoomTransport | null>(null);
  const statusRef = useRef<ConnectionStatus>('connecting');
  // Latest callbacks and nickname, read inside long-lived handlers without re-running the connection.
  const callbacksRef = useRef({
    onTeams: params.onTeams,
    onGiveUp: params.onGiveUp,
    nickname: params.nickname,
  });
  const lastPressAt = useRef(0);
  const lastActionAt = useRef(0);
  const buzzIdRef = useRef<string | null>(null);
  const actionIdRef = useRef<string | null>(null);
  const timers = useRef<Record<'optimistic' | 'flash' | 'note', ReturnType<typeof setTimeout> | undefined>>({
    optimistic: undefined,
    flash: undefined,
    note: undefined,
  });

  useEffect(() => {
    callbacksRef.current = { onTeams: params.onTeams, onGiveUp: params.onGiveUp, nickname: params.nickname };
  });

  // --- connection and stage messages -------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let stageSeenHere = false;
    let heartbeat = false;
    let waitTimer: ReturnType<typeof setTimeout> | undefined;
    let giveUpTimer: ReturnType<typeof setTimeout> | undefined;

    const stopWatching = (): void => {
      clearTimeout(waitTimer);
      clearTimeout(giveUpTimer);
      waitTimer = undefined;
      giveUpTimer = undefined;
    };
    const armSilenceWatch = (): void => {
      clearTimeout(waitTimer);
      waitTimer = setTimeout(() => {
        if (cancelled) return;
        setWaiting(true);
        clearTimeout(giveUpTimer);
        giveUpTimer = setTimeout(() => {
          if (!cancelled) callbacksRef.current.onGiveUp();
        }, GIVE_UP_MS);
      }, STAGE_SILENCE_MS);
    };

    const transport = createTransport('phone');
    transportRef.current = transport;

    const offStatus = transport.onStatus((next) => {
      if (cancelled) return;
      statusRef.current = next;
      setStatus(next);
      if (next === 'connected') {
        setWaiting(false);
        // Before the first stage message, or once the stage has shown a heartbeat, silence matters.
        if (!stageSeenHere || heartbeat) armSilenceWatch();
      } else {
        stopWatching();
        setWaiting(false);
      }
    });

    const offStage = transport.subscribe('stage', (msg) => {
      if (cancelled) return;
      stageSeenHere = true;
      setStageSeen(true);
      setWaiting(false);
      clearTimeout(giveUpTimer);
      if (msg.event === 'audience') heartbeat = true;
      if (heartbeat) armSilenceWatch();
      else clearTimeout(waitTimer);

      switch (msg.event) {
        case 'teams':
          callbacksRef.current.onTeams(msg.message.teams);
          break;
        case 'controls': {
          const { activeTeam, canBuy, canSpin, canSolve, turnName, buzzTeams, offLabel } = msg.message;
          setControls({
            activeTeam,
            canBuy,
            canSpin,
            canSolve,
            turnName,
            ...(buzzTeams === undefined ? {} : { buzzTeams }),
            ...(offLabel === undefined ? {} : { offLabel }),
          });
          break;
        }
        case 'ack': {
          const ack = msg.message;
          if (ack.team !== team) break;
          if (ack.pressId === buzzIdRef.current) {
            clearTimeout(timers.current.optimistic);
            if (ack.accepted) {
              setBuzz('flash');
              clearTimeout(timers.current.flash);
              timers.current.flash = setTimeout(() => {
                setBuzz('idle');
              }, FLASH_MS);
            } else {
              setBuzz('idle');
            }
          } else if (ack.pressId === actionIdRef.current) {
            setNote(ack.accepted ? 'sent' : 'refused');
            clearTimeout(timers.current.note);
            timers.current.note = setTimeout(() => {
              setNote(null);
            }, NOTE_MS);
          }
          break;
        }
        case 'audience':
          break;
      }
    });

    transport
      .connect({ code, role: 'phone', team, nickname: callbacksRef.current.nickname, key: userId })
      .then(() => {
        // StrictMode and fast navigation can unmount before connect settles; leave no ghost behind.
        if (cancelled) void transport.disconnect();
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        logger.warn('[phone] connect failed', error);
        statusRef.current = 'error';
        setStatus('error');
      });

    const activeTimers = timers.current;
    return () => {
      cancelled = true;
      stopWatching();
      offStatus();
      offStage();
      clearTimeout(activeTimers.optimistic);
      clearTimeout(activeTimers.flash);
      clearTimeout(activeTimers.note);
      transportRef.current = null;
      void transport.disconnect();
    };
  }, [code, team, userId, attempt, createTransport]);

  // --- keep the room alive: touch every 5 minutes while connected (real rooms only) ---------------
  useEffect(() => {
    if (status !== 'connected' || mode === 'demo') return;
    const id = setInterval(() => {
      data.rooms.touchRoom(code).catch((error: unknown) => {
        logger.warn('[phone] touchRoom failed', error);
      });
    }, TOUCH_INTERVAL_MS);
    return () => {
      clearInterval(id);
    };
  }, [status, mode, data, code]);

  // --- sending ----------------------------------------------------------------------------------
  const press = useCallback((): void => {
    const transport = transportRef.current;
    const now = Date.now();
    if (transport === null || statusRef.current !== 'connected') return;
    if (now - lastPressAt.current < PRESS_INTERVAL_MS) return;
    lastPressAt.current = now;

    const pressId = newPressId();
    buzzIdRef.current = pressId;
    setBuzz('waiting');
    clearTimeout(timers.current.optimistic);
    // Without an answer the optimistic state ends by itself; a late accepted ack still flashes.
    timers.current.optimistic = setTimeout(() => {
      setBuzz((current) => (current === 'waiting' ? 'idle' : current));
    }, OPTIMISTIC_MS);
    vibrate();
    transport.publish('phones', 'press', { pressId, team, at: now }).catch((error: unknown) => {
      logger.warn('[phone] press failed', error);
    });
  }, [team]);

  const sendAction = useCallback(
    (action: PhoneAction, answer?: string): void => {
      const transport = transportRef.current;
      if (transport === null || statusRef.current !== 'connected') return;
      const now = Date.now();
      if (action === 'buy' || action === 'spin') {
        if (now - lastActionAt.current < PRESS_INTERVAL_MS) return;
        lastActionAt.current = now;
      }
      const pressId = newPressId();
      actionIdRef.current = pressId;
      vibrate();
      const payload =
        answer === undefined
          ? { pressId, team, action }
          : { pressId, team, action, answer: answer.slice(0, 200) };
      transport.publish('phones', 'action', payload).catch((error: unknown) => {
        logger.warn('[phone] action failed', error);
      });
    },
    [team],
  );

  const sendFeudAnswer = useCallback(
    (text: string): void => {
      const transport = transportRef.current;
      if (transport === null || statusRef.current !== 'connected') return;
      transport
        .publish('phones', 'feud-answer', { pressId: newPressId(), team, text: text.slice(0, 300) })
        .catch((error: unknown) => {
          logger.warn('[phone] feud answer failed', error);
        });
    },
    [team],
  );

  const retry = useCallback((): void => {
    statusRef.current = 'connecting';
    setStatus('connecting');
    setAttempt((n) => n + 1);
  }, []);

  return { status, controls, stageSeen, waiting, buzz, note, press, sendAction, sendFeudAnswer, retry };
}
