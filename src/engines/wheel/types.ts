/**
 * Types for the Wheel of Fortune engine.
 * Rules of record: docs/WHEEL_OF_FORTUNE_RULES.md. Design: .ai/sdd/specs/001-cloud-rewrite/design.md 8.2.
 * Everything here is plain serialisable data (no Set, Map or functions).
 */
import type { Envelope } from './bonus';
import type { PuzzleState } from './puzzleState';

export type TeamId = number;

export interface Prize {
  name: string;
  value: number;
}

export type PuzzleUse = 'round' | 'tossup' | 'triple' | 'prize' | 'tiebreak' | 'bonus';

/** A puzzle as the content layer hands it to the engine (the engine never imports src/content). */
export interface PuzzleInput {
  id: string;
  category: string;
  phrase: string;
  lines?: string[];
  use: PuzzleUse[];
  prize?: Prize;
  sameLetter?: string;
  set?: string;
  theme?: string;
}

/** Ask for puzzles: the engine asks the UI by this request and receives PROVIDE_PUZZLES. */
export interface PuzzleRequest {
  use: PuzzleUse;
  count: number;
  category?: string;
  /** Triple Toss-Up set id, so a replacement stays in the set's category. */
  set?: string;
}

export interface WheelSettings {
  opening: 'classic' | 'frenzy';
  speedUpStart: 'bell' | 'round4';
  length: 'full' | 'short';
  bonusRound: boolean;
  turnTimerSec: 0 | 5 | 10;
}

export const DEFAULT_WHEEL_SETTINGS: WheelSettings = {
  opening: 'classic',
  speedUpStart: 'bell',
  length: 'full',
  bonusRound: true,
  turnTimerSec: 0,
};

export type RoundNo = 1 | 2 | 3 | 4;

/** One piece of the episode plan (rules, "Episode structure"). */
export type Segment =
  | { kind: 'tossup'; value: number; starter: boolean }
  | { kind: 'frenzy'; value: number; durationMs: number }
  | { kind: 'round'; round: RoundNo; prize: boolean }
  | { kind: 'triple'; value: number; sweep: number }
  | { kind: 'speedup' }
  /** Consolation $1,000 and tie check; resolves instantly into the next segment. */
  | { kind: 'finale' }
  | { kind: 'tiebreak'; value: number }
  | { kind: 'bonus' };

export type Stage = 'tossup' | 'frenzy' | 'round' | 'triple' | 'speedup' | 'tiebreak' | 'bonus' | 'game-over';

export type Phase =
  | 'awaiting-puzzles'
  // toss-up family (tossup, frenzy, triple, tiebreak)
  | 'tossup-reveal'
  | 'tossup-answer'
  | 'tossup-done'
  // rounds
  | 'choose'
  | 'call-consonant'
  | 'mystery-choice'
  | 'express-choice'
  | 'express-run'
  | 'solving'
  | 'round-award'
  // speed-up
  | 'speedup-spin'
  | 'speedup-act'
  | 'speedup-window'
  // bonus round
  | 'bonus-category'
  | 'bonus-spin'
  | 'bonus-letters'
  | 'bonus-ready'
  | 'bonus-solving'
  | 'bonus-timeup'
  | 'bonus-won'
  | 'bonus-opened'
  | 'done';

/** 'none', 'round' (claimed this round, at risk) or 'kept' (secured by solving). */
export type MillionStatus = 'none' | 'round' | 'kept';

export interface TeamState {
  id: TeamId;
  name: string;
  /** Banked money, prize values included. Never at risk. */
  bank: number;
  /** Names of the prizes banked so far (display only; their value is already in `bank`). */
  prizes: string[];
  /** This round's spendable cash. */
  roundCash: number;
  /** This round's prizes (trip wedge, Mystery $10,000): not spendable, kept only by solving. */
  roundPrizes: Prize[];
  wildCard: boolean;
  millionWedge: MillionStatus;
  /** Locked out of the toss-up in play. */
  lockedOut: boolean;
}

export interface WheelSpecials {
  wildCard: boolean;
  million: boolean;
  trip: boolean;
  /** Ring index of the flipped Mystery wedge; null while both are still Mystery wedges. */
  mysteryFlipped: number | null;
}

export type WedgeKind =
  'cash' | 'bankrupt' | 'lose-turn' | 'wild-card' | 'million' | 'trip' | 'mystery' | 'express';

export interface SpinInfo {
  index: number;
  kind: WedgeKind;
  /** Dollars per letter. */
  value: number;
  third: 0 | 1 | 2 | null;
  /** True for the extra consonant a played Wild Card gives. */
  wildCardCall: boolean;
  /** Round cash earned on this wedge so far (what a Mystery flip gives up). */
  earned: number;
}

export interface Award {
  team: TeamId | null;
  amount: number;
  prizes: Prize[];
  round: number;
  speedUp: boolean;
}

export interface TossupInfo {
  value: number;
  /** The solver (or first team in play order if unsolved) starts the next round. */
  starter: boolean;
  buzzed: TeamId | null;
  buzzedAt: number | null;
  /** Teams allowed to buzz; null means everyone (a tiebreaker limits it to the tied teams). */
  eligible: TeamId[] | null;
  solver: TeamId | null;
}

export interface FrenzyInfo {
  durationMs: number;
  msLeft: number;
  /** The clock starts with the first letter. */
  started: boolean;
  /** The clock ran out while a team was answering; the answer still counts. */
  expired: boolean;
  lastSolver: TeamId | null;
  solved: number;
  category: string | null;
}

export interface TripleInfo {
  index: number;
  solvers: (TeamId | null)[];
  sweep: number;
  value: number;
}

export interface SpeedUpInfo {
  /** Wedge value plus $1,000, once the spin is made. */
  value: number | null;
}

export interface BonusInfo {
  team: TeamId;
  options: PuzzleInput[];
  category: string | null;
  envelope: Envelope | null;
  /** Letters the team chose (the free RSTLNE are not listed). */
  picked: string[];
  hasWildCard: boolean;
  hasMillion: boolean;
  won: boolean | null;
  opened: boolean;
  /** Phase to return to after a replacement puzzle arrives. */
  resume: Phase | null;
}

export interface TimedOutContext {
  team: TeamId;
  from: Phase;
  spin: SpinInfo | null;
  lastConsonant: number | null;
  dryFails: number;
}

export type WheelEventType =
  | 'segment'
  | 'puzzle'
  | 'letters-lit'
  | 'tile-revealed'
  | 'buzz'
  | 'tossup-correct'
  | 'tossup-wrong'
  | 'tossup-filled'
  | 'frenzy-end'
  | 'sweep'
  | 'spin'
  | 'respin'
  | 'letter-correct'
  | 'letter-miss'
  | 'letter-repeat'
  | 'vowel-bought'
  | 'same-letter'
  | 'bankrupt'
  | 'lose-turn'
  | 'turn'
  | 'time-out'
  | 'solve-start'
  | 'solve-correct'
  | 'solve-wrong'
  | 'round-solved'
  | 'round-unsolved'
  | 'puzzle-thrown-out'
  | 'wild-card-claimed'
  | 'wild-card-played'
  | 'million-claimed'
  | 'million-kept'
  | 'trip-claimed'
  | 'mystery-keep'
  | 'mystery-flip'
  | 'express-play'
  | 'express-pass'
  | 'bell'
  | 'speedup'
  | 'consolation'
  | 'bonus-category'
  | 'bonus-spin'
  | 'bonus-letter'
  | 'bonus-clock'
  | 'bonus-solved'
  | 'bonus-wrong'
  | 'bonus-time-up'
  | 'bonus-opened'
  | 'bank-adjusted'
  | 'undo'
  | 'game-over';

/** Presentation event; `seq` is monotonic and never rewound by undo. */
export interface WheelEvent {
  seq: number;
  type: WheelEventType;
  team?: TeamId;
  letter?: string;
  count?: number;
  amount?: number;
  index?: number;
  label?: string;
}

export interface LastRuling {
  team: TeamId | null;
  verdict: 'correct' | 'wrong';
  /** The `step` value right after the ruling; the ruling can be overridden only while it is current. */
  step: number;
}

export interface GameOutcome {
  winnerId: TeamId;
}

export interface WheelState {
  version: 1;
  settings: WheelSettings;
  /** Teams in play order. */
  teams: TeamState[];
  plan: Segment[];
  planIndex: number;
  stage: Stage;
  phase: Phase;
  /** 1-4 in Rounds and the Speed-Up, 0 elsewhere. */
  round: number;
  bell: boolean;
  specials: WheelSpecials;
  nextStarter: TeamId | null;
  lastStarter: TeamId | null;
  turn: TeamId | null;
  puzzle: PuzzleState | null;
  /** Puzzles provided and not yet played; queue[0] is the "next puzzle". */
  queue: PuzzleInput[];
  request: PuzzleRequest | null;
  awaiting: 'start' | 'replace' | null;
  /** Phase to enter once a replacement puzzle arrives. */
  resumePhase: Phase | null;
  seen: string[];
  spin: SpinInfo | null;
  /** Dollar value of the last correct consonant, which a Wild Card can repeat. */
  lastConsonant: number | null;
  solve: { team: TeamId; from: Phase } | null;
  speedUp: SpeedUpInfo | null;
  /** The turn in play began with nothing left to spin for. */
  turnDry: boolean;
  dryFails: number;
  passedAt: number | null;
  timedOut: TeamId | null;
  timedOutCtx: TimedOutContext | null;
  award: Award | null;
  lastRuling: LastRuling | null;
  tossup: TossupInfo | null;
  frenzy: FrenzyInfo | null;
  triple: TripleInfo | null;
  bonus: BonusInfo | null;
  outcome: GameOutcome | null;
  step: number;
  history: Snapshot[];
  events: WheelEvent[];
  eventSeq: number;
}

/** A history entry: the whole state minus history and events (events are never rewound). */
export type Snapshot = Omit<WheelState, 'history' | 'events'>;

export type ActionBody =
  | { type: 'SPIN'; draw: number }
  | { type: 'CALL_LETTER'; letter: string }
  | { type: 'BUY_VOWEL'; letter: string }
  | { type: 'SOLVE_START' }
  | { type: 'SOLVE'; verdict: 'correct' | 'wrong' }
  | { type: 'SOLVE_CANCEL' }
  | { type: 'BUZZ'; team: TeamId; at: number }
  | { type: 'TOSSUP_REVEAL_NEXT'; draw: number }
  | { type: 'TOSSUP_ANSWER'; team: TeamId; verdict: 'correct' | 'wrong' }
  | { type: 'FRENZY_TICK'; ms: number }
  | { type: 'PLAY_WILD_CARD' }
  | { type: 'MYSTERY'; choice: 'keep' | 'flip'; draw?: number }
  | { type: 'EXPRESS'; choice: 'play' | 'pass' }
  | { type: 'RING_BELL' }
  | { type: 'SPEEDUP_SPIN'; draw: number }
  | { type: 'TIME_OUT'; team: TeamId }
  | { type: 'LATE_SOLVE' }
  | { type: 'HOST_SOLVE_OVERRIDE'; verdict: 'correct' | 'wrong' }
  | { type: 'SKIP_TURN' }
  | { type: 'SET_TURN'; team: TeamId }
  | { type: 'THROW_OUT_PUZZLE' }
  | { type: 'END_ROUND_UNSOLVED' }
  | { type: 'ADJUST_BANK'; team: TeamId; delta: number }
  | { type: 'SET_TURN_TIMER'; sec: 0 | 5 | 10 }
  | { type: 'PROVIDE_PUZZLES'; puzzles: PuzzleInput[] }
  | { type: 'BONUS_PICK_CATEGORY'; category: string }
  | { type: 'BONUS_SPIN'; draw: number }
  | { type: 'BONUS_CALL_LETTER'; letter: string }
  | { type: 'BONUS_SOLVE'; verdict: 'correct' | 'wrong' }
  | { type: 'BONUS_TIME_UP' }
  | { type: 'BONUS_ACCEPT_LATE' }
  | { type: 'BONUS_OPEN_ENVELOPE' }
  | { type: 'CONTINUE' }
  | { type: 'UNDO' }
  /** Presentation: light the next queued tile (letters light one at a time in reading order). */
  | { type: 'LIGHT_NEXT' }
  | { type: 'LIGHT_ALL' };

/** Every action may carry `at` (epoch ms); passing actions record it for the 500 ms drop rule. */
export type WheelAction = ActionBody & { at?: number };

export type WheelActionType = ActionBody['type'];

export interface WheelInit {
  teams: { id: TeamId; name: string }[];
  settings?: Partial<WheelSettings>;
}
