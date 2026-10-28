/**
 * The contract between the stage (event shell) and each game module (design.md §7, §8).
 * A game is a React component taking `GameProps`; it owns its engine and controller, reports
 * its result exactly once through `onGameEnd`, and never talks to the network or storage
 * directly: phones and host views are reached through the two bridges below.
 */
import type { Team } from '@/engines/event';
import type { ActionMessage, ControlsMessage, FeudAnswerMessage, PressMessage } from '@/realtime';
import type { AudioPlayer } from '@/audio/player';
import type { HostBridge } from '@/host/hostProtocol';

/** What a finished game reports (eventReducer GAME_WON credits exactly this). */
export interface GameEndReport {
  winnerId: number;
  /** Points for the winner on the event scoreboard. */
  roundScore: number;
  /** Points for the other teams (Feud loser keeps its game score; Wheel totals / 100). */
  extraScores?: { team: number; points: number }[];
  /** Extra Plinko chips for the winner (Fast Money 200, Bonus Round win). */
  bonusChips?: number;
}

/** Controls published to phones, minus the transport envelope. */
export type PhoneControls = Omit<ControlsMessage, 'v' | 'from' | 'sent'>;

export const IDLE_PHONE_CONTROLS: PhoneControls = {
  activeTeam: null,
  canBuy: false,
  canSpin: false,
  canSolve: false,
  turnName: '',
  buzzTeams: [],
  offLabel: 'Buzzers are off',
};

/** The stage's side of the phone relay, handed to a game (P-004: the game re-checks everything). */
export interface PhoneBridge {
  publishControls(controls: PhoneControls): void;
  onPress(handler: (press: PressMessage) => void): () => void;
  onAction(handler: (action: ActionMessage) => void): () => void;
  onFeudAnswer(handler: (answer: FeudAnswerMessage) => void): () => void;
  ack(team: number, pressId: string, accepted: boolean): void;
}

export interface GameProps {
  teams: Team[];
  /** Team ids in play order (Wheel turn order); null when the doors were never drawn. */
  playOrder: number[] | null;
  usedContentIds: readonly string[];
  onContentUsed(ids: string[]): void;
  /** True while paused (F8) or any app dialog is open: freeze clocks, keys, phones, commands. */
  inputLocked: boolean;
  showMode: boolean;
  /** Engine snapshot saved by a previous session (FR-005); undefined for a fresh game. */
  initialState?: unknown;
  /** Called after every engine change so the stage can persist the snapshot. */
  onStateChange(state: unknown): void;
  onGameEnd(report: GameEndReport): void;
  /** Two-tap quit is handled by the stage; this is the confirmed quit. */
  onQuitToHub(): void;
  audio: AudioPlayer;
  phones: PhoneBridge;
  host: HostBridge;
  /** Bumped per game start so a game component remounts clean. */
  gameInstance: number;
}
