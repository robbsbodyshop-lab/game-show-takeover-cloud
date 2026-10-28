/**
 * Presentation rules for the phone: what the BUZZ button says and when the podium shows (FR-023).
 * The stage decides everything; these helpers only turn its `controls` message into labels (P-004:
 * the stage re-checks every press, so greying out here is courtesy, not security).
 */
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@/data/roomCode';
import type { ControlsMessage } from '@/realtime/schemas';
import type { JoinError } from './usePhoneFlow';

export type PhoneControls = Omit<ControlsMessage, 'v' | 'from' | 'sent'>;

/**
 * Feud agent contract: when the stage lets phones type an answer it publishes `controls.offLabel`
 * with exactly this literal (there is no dedicated field in the protocol yet). The phone shows an
 * answer box to the teams that may type (see `canTypeAnswer`) instead of the BUZZ button.
 */
export const TYPE_YOUR_ANSWER = 'TYPE YOUR ANSWER';

export const BUZZ_LABEL = 'BUZZ';
export const BUZZERS_OFF_LABEL = 'Buzzers are off';
export const NOT_CONNECTED_LABEL = 'Not connected';

export interface BuzzPresentation {
  /** True when a press would do something. */
  live: boolean;
  /** Button text: `BUZZ` when live, otherwise the reason it is grey. */
  label: string;
}

/**
 * - team in `buzzTeams`: live;
 * - otherwise the stage's `offLabel` ("Not in this match", "Locked out of this puzzle", ...);
 * - otherwise "Waiting for <turnName>" while another team is up;
 * - otherwise "Buzzers are off".
 */
export function buzzPresentation(controls: PhoneControls | null, team: number): BuzzPresentation {
  if (controls === null) return { live: false, label: BUZZERS_OFF_LABEL };
  if (controls.buzzTeams?.includes(team) === true) return { live: true, label: BUZZ_LABEL };
  if (controls.offLabel !== undefined && controls.offLabel !== '' && controls.offLabel !== TYPE_YOUR_ANSWER) {
    return { live: false, label: controls.offLabel };
  }
  if (controls.activeTeam !== null && controls.activeTeam !== team) {
    return {
      live: false,
      label: controls.turnName === '' ? 'Waiting for the other team' : `Waiting for ${controls.turnName}`,
    };
  }
  return { live: false, label: BUZZERS_OFF_LABEL };
}

/**
 * The one `controls` message is broadcast to every phone, so a team may type only if it is the
 * active team (or none is active) and, when the stage lists `buzzTeams`, it is on that list.
 */
export function canTypeAnswer(controls: PhoneControls | null, team: number): boolean {
  if (controls?.offLabel !== TYPE_YOUR_ANSWER) return false;
  if (controls.activeTeam !== null && controls.activeTeam !== team) return false;
  return controls.buzzTeams === undefined || controls.buzzTeams.includes(team);
}

/** The podium is for the team whose turn it is while it has something to do. */
export function hasPodiumActions(controls: PhoneControls | null, team: number): boolean {
  return controls?.activeTeam === team && (controls.canBuy || controls.canSpin || controls.canSolve);
}

const NOT_A_CONSONANT = new RegExp(`[^${ROOM_CODE_ALPHABET}]`, 'g');

/** Uppercases and drops anything that is not one of the 20 room-code consonants; at most 4 letters. */
export const cleanRoomCode = (raw: string): string =>
  raw.toUpperCase().replace(NOT_A_CONSONANT, '').slice(0, ROOM_CODE_LENGTH);

export const JOIN_MESSAGES: Readonly<Record<JoinError, string>> = {
  not_found: 'Room not found. Check the code on the game screen.',
  rate_limited: 'Too many tries, wait a few minutes.',
  unavailable: 'Cannot reach the game server. Check your connection and try again.',
  gave_up: 'Lost the game screen. Enter the room code again.',
};
