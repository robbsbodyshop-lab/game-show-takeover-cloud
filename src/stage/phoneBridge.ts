/**
 * The stage's side of the phone relay, handed to a game as `PhoneBridge` (gameContract.ts).
 *
 *  - Controls are debounced 50 ms and re-sent on every (re)connect (design.md §5).
 *  - Presses are rate limited to one per 150 ms per team (FR-029) and ignored for teams that are not
 *    in the event, so a stale phone can never act for a removed team (P-004).
 *  - While the stage is locked (paused or a dialog open, FR-015) presses, actions and typed answers
 *    are dropped and a press is answered with `accepted: false`.
 *  - A keyboard buzz (keys 1-8) goes through `injectPress`, i.e. the same checks and the same
 *    handlers as a phone press.
 * The game still re-checks every press against its engine; this layer only filters transport noise.
 */
import { logger } from '@/lib/logger';
import type { ActionMessage, FeudAnswerMessage, PressMessage, RoomTransport } from '@/realtime';
import type { PhoneBridge, PhoneControls } from './gameContract';

export const CONTROLS_DEBOUNCE_MS = 50;
export const PRESS_MIN_INTERVAL_MS = 150;
/** Prefix of press ids made by the keyboard path; they are never acked over the network. */
export const KEYBOARD_PRESS_PREFIX = 'kb-';

export type InjectResult = 'delivered' | 'locked' | 'unknown-team' | 'rate-limited';

export interface StagePhoneBridge extends PhoneBridge {
  /** A keyboard (or host command) buzz for `team`, through the same path as a phone press. */
  injectPress(team: number): InjectResult;
  setLocked(locked: boolean): void;
  /** Re-sends the latest controls now (after a reconnect). */
  republish(): void;
  dispose(): void;
}

export interface PhoneBridgeDeps {
  transport: RoomTransport;
  /** Ids of the teams in the event right now. */
  getTeamIds: () => readonly number[];
  now?: () => number;
}

export function createPhoneBridge(deps: PhoneBridgeDeps): StagePhoneBridge {
  const { transport } = deps;
  const now = deps.now ?? Date.now;
  const pressHandlers = new Set<(press: PressMessage) => void>();
  const actionHandlers = new Set<(action: ActionMessage) => void>();
  const answerHandlers = new Set<(answer: FeudAnswerMessage) => void>();
  const lastPressAt = new Map<number, number>();

  let locked = false;
  let disposed = false;
  let latest: PhoneControls | null = null;
  let lastSent: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let keyboardSeq = 0;

  const knownTeam = (team: number): boolean => deps.getTeamIds().includes(team);

  const sendControls = (force: boolean): void => {
    if (disposed || latest === null || transport.status !== 'connected') return;
    const text = JSON.stringify(latest);
    if (!force && text === lastSent) return;
    lastSent = text;
    transport.publish('stage', 'controls', latest).catch((error: unknown) => {
      lastSent = null;
      logger.warn('[phones] controls publish failed', error);
    });
  };

  const ack = (team: number, pressId: string, accepted: boolean): void => {
    if (disposed || pressId.startsWith(KEYBOARD_PRESS_PREFIX) || transport.status !== 'connected') return;
    transport.publish('stage', 'ack', { team, pressId, accepted }).catch((error: unknown) => {
      logger.warn('[phones] ack publish failed', error);
    });
  };

  const deliverPress = (press: PressMessage): InjectResult => {
    if (!knownTeam(press.team)) return 'unknown-team';
    if (locked) {
      ack(press.team, press.pressId, false);
      return 'locked';
    }
    const t = now();
    const last = lastPressAt.get(press.team);
    if (last !== undefined && t - last < PRESS_MIN_INTERVAL_MS) return 'rate-limited';
    lastPressAt.set(press.team, t);
    for (const handler of [...pressHandlers]) handler(press);
    return 'delivered';
  };

  const unsubscribe = transport.subscribe('phones', (parsed) => {
    if (disposed) return;
    switch (parsed.event) {
      case 'press':
        deliverPress(parsed.message);
        return;
      case 'action': {
        const { message } = parsed;
        if (!knownTeam(message.team)) return;
        if (locked) {
          ack(message.team, message.pressId, false);
          return;
        }
        for (const handler of [...actionHandlers]) handler(message);
        return;
      }
      case 'feud-answer': {
        const { message } = parsed;
        if (!knownTeam(message.team)) return;
        if (locked) {
          ack(message.team, message.pressId, false);
          return;
        }
        for (const handler of [...answerHandlers]) handler(message);
      }
    }
  });

  return {
    publishControls(controls) {
      latest = controls;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        sendControls(false);
      }, CONTROLS_DEBOUNCE_MS);
    },
    onPress(handler) {
      pressHandlers.add(handler);
      return () => {
        pressHandlers.delete(handler);
      };
    },
    onAction(handler) {
      actionHandlers.add(handler);
      return () => {
        actionHandlers.delete(handler);
      };
    },
    onFeudAnswer(handler) {
      answerHandlers.add(handler);
      return () => {
        answerHandlers.delete(handler);
      };
    },
    ack,
    injectPress(team) {
      keyboardSeq += 1;
      const at = now();
      return deliverPress({
        v: 1,
        from: 'phone',
        sent: at,
        pressId: `${KEYBOARD_PRESS_PREFIX}${String(keyboardSeq)}`,
        team,
        at,
      });
    },
    setLocked(value) {
      locked = value;
    },
    republish() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      sendControls(true);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      unsubscribe();
      pressHandlers.clear();
      actionHandlers.clear();
      answerHandlers.clear();
    },
  };
}
