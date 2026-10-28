/**
 * Shapes shared by the Feud controller, the stage components and the console. Everything the
 * stage renders comes through `FeudViewModel` (audience data only); everything hidden travels in
 * `FeudHostData`, which only goes to the host topic and the host console (P-002).
 */
import type { AnsweringRole, AudienceView, HostView } from '@/engines/feud/selectors';
import type { FeudState, Side } from '@/engines/feud/types';
import type { HostControl } from './hostControls';
import type { FeudSettings } from './settings';

export interface FeudTeamInfo {
  id: number;
  name: string;
  color: string;
  players: string[];
}

export type FeudTeams = Readonly<Record<Side, FeudTeamInfo>>;

/** A countdown the console can draw: it extrapolates from `remainingMs` using `at` while `running`. */
export interface ClockView {
  remainingMs: number;
  leadMs: number;
  totalMs: number;
  running: boolean;
  /** Epoch ms when this was sampled on the stage. */
  at: number;
}

export type AnswerSource = 'host' | 'phone' | 'voice';

/** A near miss or an unclear voice answer waiting for the host's ruling. */
export interface PendingReview {
  id: number;
  text: string;
  source: AnswerSource;
  role: Exclude<AnsweringRole, 'fast-money'>;
  side: Side;
  teamId: number;
  playerIndex: number;
  /** Board slot the judge thinks was meant (a suggestion only), or null. */
  suggestedSlot: number | null;
  candidates: number[];
  confidence: number;
}

/** A Fast Money answer scored 0 until the host rules (docs: "CHECK ... suggested"). */
export interface FmCheck {
  player: 1 | 2;
  question: number;
  text: string;
  suggested: number | null;
  candidates: number[];
}

export type MicStatus = 'off' | 'listening' | 'unavailable' | 'stopped';

export interface MicView {
  status: MicStatus;
  /** The latest thing the recogniser heard, for the host to see. */
  transcript: string;
}

export interface BrowserEntry {
  id: string;
  question: string;
  answers: number;
  used: boolean;
  onBoard: boolean;
}

export interface FeudContentView {
  freshSurveys: number;
  totalSurveys: number;
  freshFastMoney: number;
  totalFastMoney: number;
  /** "Running low" under 10 fresh surveys (HOST_FEATURE_INVENTORY.md 5.3). */
  runningLow: boolean;
  /** The browsable list, present only while the host has the browser open. */
  browser: BrowserEntry[] | null;
}

export interface StakeTexts {
  ifWin: string;
  ifLose: string;
}

/** The host snapshot payload (HostSnapshot.data for kind 'feud'). */
export interface FeudHostData {
  /** The engine's host view with the event logs stripped (they are large and not needed). */
  view: HostView;
  teams: FeudTeams;
  matchLabel: string | null;
  answeringTeamId: number | null;
  answeringName: string | null;
  answeringPlayer: string | null;
  clocks: { answer: ClockView | null; steal: ClockView | null; fastMoney: ClockView | null };
  /** "Survey says" beat waiting to flip: what the host ruled. */
  ruling: { text: string | null; slot: number | 'miss' } | null;
  pendingReview: (PendingReview & { suggestedAnswer: string | null }) | null;
  fmChecks: FmCheck[];
  stakes: StakeTexts | null;
  sayThis: string[];
  controls: HostControl[];
  advanceLabel: string | null;
  content: FeudContentView;
  settings: FeudSettings;
  mic: MicView;
  /** Who may type answers right now. */
  answerSources: { host: boolean; phones: boolean };
  surveyedText: string | null;
  endReported: boolean;
  fmTotals: { shown: number; p1: number; p2: number } | null;
}

/** What the stage may render. No answer text of a hidden slot, no clocks the audience must not see. */
export interface FeudViewModel {
  gameRev: number;
  audience: AudienceView;
  teams: FeudTeams;
  matchLabel: string | null;
  /** Live settings (the match card shows the target before the engine has taken them). */
  settings: FeudSettings;
  /** Points needed to win: the live setting before round 1, the engine's afterwards. */
  targetScore: number;
  /** The big red X: `id` changes with every new X so the animation replays. */
  overlay: { id: number; count: number } | null;
  /** The "survey says" beat is running (the flip or X is about to land). */
  surveySays: boolean;
  /** Host buttons for this moment (stage host bar); labels carry no answers. */
  controls: HostControl[];
  advanceLabel: string | null;
  /** The typed-answer box is useful right now. */
  answerBox: { available: boolean; role: AnsweringRole | null };
  reviewPending: boolean;
  mic: MicView;
  /** Fast Money clock for the audience, or null. */
  fmClockMs: number | null;
  inputLocked: boolean;
  /** The engine phase after a game-over report, for the stage to show "waiting". */
  endReported: boolean;
}

/** Everything persisted through `onStateChange`; plain JSON. */
export interface FeudSavedState {
  version: 1;
  engine: FeudState;
  gameRev: number;
  usedLocal: string[];
  endReported: boolean;
  jackpotCued: boolean;
  review: PendingReview | null;
  fmChecks: FmCheck[];
  clocks: {
    answer: { remainingMs: number; leadMs: number; totalMs: number; turnKey: string } | null;
    steal: { remainingMs: number; leadMs: number; totalMs: number } | null;
  };
}
