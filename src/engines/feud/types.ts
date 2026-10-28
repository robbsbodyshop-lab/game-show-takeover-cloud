/**
 * Family Feud engine types. Rules of record: docs/FAMILY_FEUD_RULES.md; design.md section 8.1.
 * Plain serialisable data only (no Map, Set or functions). Content arrives in actions; the
 * input types below are this module's own minimal shape so the engine does not depend on
 * src/content.
 */

export type Side = 'A' | 'B';
export const SIDES: readonly Side[] = ['A', 'B'];
export const otherSide = (side: Side): Side => (side === 'A' ? 'B' : 'A');

// ---------------------------------------------------------------- content input

export interface FeudAnswerInput {
  readonly answer: string;
  readonly points: number;
  readonly aliases?: readonly string[] | undefined;
}

/** A main-game survey, highest points first. A Fast Money question has the same shape. */
export interface FeudSurveyInput {
  readonly id: string;
  readonly question: string;
  readonly surveyed?: number | undefined;
  readonly answers: readonly FeudAnswerInput[];
}

// ---------------------------------------------------------------- settings

export type TargetScore = 200 | 300 | 400 | 500;
export type StealTimerSec = 0 | 15 | 30;

export interface FeudSettings {
  /** A family at or above this after a decided round wins (rules, Main game 1). Default 300. */
  readonly targetScore: TargetScore;
  /** 'one-round' is the short bracket format: the round winner wins the game. */
  readonly format: 'full' | 'one-round';
  readonly fastMoneyEnabled: boolean;
  /** Host-only answer timer for the control phase (rules, Main game 4). Default 5. */
  readonly answerTimerSec: number;
  /** Steal huddle length; 0 means as long as the host allows. */
  readonly stealTimerSec: StealTimerSec;
}

export const DEFAULT_SETTINGS: FeudSettings = {
  targetScore: 300,
  format: 'full',
  fastMoneyEnabled: true,
  answerTimerSec: 5,
  stealTimerSec: 0,
};

// ---------------------------------------------------------------- board

export type RevealVia = 'faceoff' | 'control' | 'steal' | 'leftover';

export interface BoardSlot {
  readonly answer: string;
  readonly points: number;
  /** Judging aliases. Host-only: never exposed by the audience view. */
  readonly aliases: readonly string[];
  readonly revealed: boolean;
  readonly revealedBy: Side | 'host' | null;
  /** How it was revealed. Only 'faceoff' and 'control' reveals count toward the bank. */
  readonly via: RevealVia | null;
}

// ---------------------------------------------------------------- phases and sub-states

export type FeudPhase =
  | 'pre-game'
  | 'round-intro'
  | 'face-off'
  | 'play-or-pass'
  | 'control'
  | 'steal-confer'
  | 'steal-answer'
  | 'round-decided'
  | 'round-summary'
  | 'sudden-death'
  | 'game-won'
  | 'fast-money'
  | 'game-over';

export type FaceOffStage = 'ready' | 'buzzers-open' | 'first-answer' | 'second-answer' | 'won';

export interface FaceOffState {
  readonly stage: FaceOffStage;
  /** Down-the-line pair index: 0 is the original pair, 1 the next pair, and so on. */
  readonly pair: number;
  /** The family that buzzed first; it answers first in every pair. */
  readonly first: Side | null;
  /** The first player's result in the current pair (null = miss). Meaningful in 'second-answer'. */
  readonly firstSlot: number | null;
  readonly winner: Side | null;
  /** Podium index of the face-off winner. */
  readonly winnerPlayer: number | null;
}

export interface ControlState {
  readonly family: Side;
  /** Podium index of the player who answers next. */
  readonly player: number;
  /** True when the family was passed the board. */
  readonly passed: boolean;
}

export interface StealState {
  readonly family: Side;
  readonly result: 'pending' | 'success' | 'fail';
  /** The slot the steal answered, if it was a board answer. */
  readonly slot: number | null;
}

export type RoundHow = 'cleared' | 'steal-success' | 'steal-fail' | 'sudden-death';

export interface RoundResult {
  readonly winner: Side;
  /** The multiplied bank that went onto the winner's game score. */
  readonly bank: number;
  readonly how: RoundHow;
}

export interface FeudFamily {
  readonly teamId: string;
  readonly podiumSize: number;
  readonly score: number;
}

// ---------------------------------------------------------------- Fast Money

export type FastMoneyPhase =
  'setup' | 'p1-ready' | 'p1-playing' | 'p1-reveal' | 'p2-ready' | 'p2-playing' | 'p2-reveal' | 'done';

export type FastMoneyPlayer = 1 | 2;

export interface FastMoneyClock {
  readonly remainingMs: number;
  readonly running: boolean;
}

/** What a player said and how it was judged. `slot` null = not on the survey. */
export interface FastMoneyRecord {
  readonly text: string;
  readonly slot: number | null;
  /** Optional survey group id: answers in one group count as the same answer. */
  readonly group?: string | undefined;
}

export type FastMoneyOutcome = 'jackpot' | 'consolation';

export interface FastMoneyState {
  readonly phase: FastMoneyPhase;
  readonly family: Side;
  readonly podiumSize: number;
  /** Podium indexes of Player 1 and Player 2; null until chosen. */
  readonly players: { readonly p1: number; readonly p2: number } | null;
  readonly questions: readonly FeudSurveyInput[];
  /** Per player, per question index. null = passed or not answered. */
  readonly records: {
    readonly p1: readonly (FastMoneyRecord | null)[];
    readonly p2: readonly (FastMoneyRecord | null)[];
  };
  /** Question indexes still to ask for the current player; the first is on screen. */
  readonly queue: readonly number[];
  readonly clock: FastMoneyClock;
  /** Reveal steps shown so far per player (0..11, see REVEAL_STEPS). */
  readonly reveal: { readonly p1: number; readonly p2: number };
  readonly endedEarly: boolean;
  readonly outcome: FastMoneyOutcome | null;
  readonly seq: number;
  readonly events: readonly FastMoneyEvent[];
}

export type FastMoneyEventPayload =
  | { readonly type: 'PLAYERS_CHOSEN'; readonly p1: number; readonly p2: number }
  | { readonly type: 'QUESTIONS_PROVIDED' }
  | { readonly type: 'CLOCK_STARTED'; readonly player: FastMoneyPlayer; readonly ms: number }
  | { readonly type: 'CLOCK_PAUSED' }
  | { readonly type: 'CLOCK_RESUMED' }
  | { readonly type: 'TIME_UP'; readonly player: FastMoneyPlayer }
  | { readonly type: 'QUESTION_SHOWN'; readonly player: FastMoneyPlayer; readonly question: number }
  | { readonly type: 'ANSWERED'; readonly player: FastMoneyPlayer; readonly question: number }
  | { readonly type: 'PASSED'; readonly player: FastMoneyPlayer; readonly question: number }
  | { readonly type: 'DUPLICATE'; readonly player: FastMoneyPlayer; readonly question: number }
  | { readonly type: 'ALL_ANSWERED'; readonly player: FastMoneyPlayer }
  | {
      readonly type: 'YOU_SAID';
      readonly player: FastMoneyPlayer;
      readonly question: number;
      readonly text: string | null;
    }
  | {
      readonly type: 'SURVEY_SAID';
      readonly player: FastMoneyPlayer;
      readonly question: number;
      readonly answer: string | null;
      readonly points: number;
      readonly total: number;
    }
  | { readonly type: 'BOARD_CLEARED'; readonly player: FastMoneyPlayer; readonly total: number }
  | {
      readonly type: 'MATCH_SET';
      readonly player: FastMoneyPlayer;
      readonly question: number;
      readonly slot: number | null;
    }
  | { readonly type: 'RULED_OFF'; readonly player: FastMoneyPlayer; readonly question: number }
  | {
      readonly type: 'FAST_MONEY_DONE';
      readonly total: number;
      readonly won: boolean;
      readonly endedEarly: boolean;
    };

export type FastMoneyEvent = FastMoneyEventPayload & { readonly seq: number };

export interface FastMoneyJudged {
  /** Survey slot the answer matches, or null for "not on the survey". */
  readonly slot: number | null;
  readonly group?: string | undefined;
}

export type FastMoneyAction =
  | { readonly type: 'PROVIDE_QUESTIONS'; readonly questions: readonly FeudSurveyInput[] }
  | { readonly type: 'CHOOSE_PLAYERS'; readonly p1: number; readonly p2: number }
  | { readonly type: 'START_CLOCK' }
  | { readonly type: 'TICK'; readonly ms: number }
  | { readonly type: 'PAUSE' }
  | { readonly type: 'RESUME' }
  | { readonly type: 'ANSWER'; readonly text: string; readonly judged: FastMoneyJudged }
  | { readonly type: 'PASS' }
  | { readonly type: 'REVEAL_NEXT' }
  | {
      readonly type: 'HOST_SET_MATCH';
      readonly player: FastMoneyPlayer;
      readonly question: number;
      readonly slot: number | null;
      readonly group?: string | undefined;
    }
  | { readonly type: 'END_EARLY' };

// ---------------------------------------------------------------- events

export type FeudEventPayload =
  | { readonly type: 'GAME_STARTED' }
  | {
      readonly type: 'ROUND_STARTED';
      readonly round: number;
      readonly multiplier: number;
      readonly slots: number;
      readonly suddenDeath: boolean;
    }
  | { readonly type: 'BUZZERS_OPENED' }
  | { readonly type: 'BUZZED'; readonly team: Side; readonly at: number }
  | { readonly type: 'BUZZER_ASSIGNED'; readonly team: Side }
  | {
      readonly type: 'ANSWER_REVEALED';
      readonly slot: number;
      readonly by: Side | 'host';
      readonly via: RevealVia;
      readonly answer: string;
      readonly points: number;
    }
  /** Face-off X: shown, never a strike. */
  | { readonly type: 'FACEOFF_X'; readonly side: Side }
  | { readonly type: 'DOWN_THE_LINE'; readonly pair: number }
  | { readonly type: 'FACEOFF_WON'; readonly side: Side; readonly player: number }
  | { readonly type: 'CONTROL_CHOSEN'; readonly choice: 'play' | 'pass'; readonly family: Side }
  | { readonly type: 'REPEAT'; readonly family: Side; readonly player: number }
  | {
      readonly type: 'STRIKE';
      readonly family: Side;
      readonly strikes: number;
      readonly cause: 'miss' | 'pass' | 'timeout';
    }
  | { readonly type: 'STEAL_CONFER'; readonly family: Side; readonly seconds: number }
  | { readonly type: 'STEAL_ANSWERING'; readonly family: Side }
  | { readonly type: 'STEAL_RESULT'; readonly family: Side; readonly success: boolean }
  | {
      readonly type: 'ROUND_DECIDED';
      readonly winner: Side;
      readonly bank: number;
      readonly how: RoundHow;
    }
  | { readonly type: 'ROUND_SUMMARY' }
  | { readonly type: 'NEXT_ROUND'; readonly round: number }
  | { readonly type: 'SUDDEN_DEATH_READY'; readonly retry: boolean }
  | { readonly type: 'MULTIPLIER_SET'; readonly multiplier: number }
  | { readonly type: 'SURVEY_REPLACED' }
  | {
      readonly type: 'GAME_WON';
      readonly winner: Side;
      readonly reason: 'target' | 'one-round' | 'sudden-death';
    }
  | { readonly type: 'FAST_MONEY_SKIPPED' }
  | { readonly type: 'FAST_MONEY'; readonly event: FastMoneyEvent }
  | { readonly type: 'GAME_OVER' }
  | { readonly type: 'UNDONE' };

export type FeudEvent = FeudEventPayload & { readonly seq: number };

// ---------------------------------------------------------------- state

/** A snapshot kept for UNDO: everything except the history, the event log and the sequence. */
export type FeudSnapshot = Omit<FeudState, 'history' | 'events' | 'seq'>;

export interface FeudState {
  readonly phase: FeudPhase;
  readonly settings: FeudSettings;
  readonly families: Readonly<Record<Side, FeudFamily>>;
  readonly roundNumber: number;
  readonly multiplier: number;
  readonly suddenDeath: boolean;
  /** The survey on the board (null before START_ROUND). Answers live in `board`. */
  readonly survey: {
    readonly id: string;
    readonly question: string;
    readonly surveyed?: number | undefined;
  } | null;
  readonly board: readonly BoardSlot[];
  /** Strikes of the family in control (0..3). Face-off X's never count. */
  readonly strikes: number;
  /** Multiplied total of the counted reveals so far. */
  readonly bank: number;
  readonly faceOff: FaceOffState | null;
  readonly control: ControlState | null;
  readonly steal: StealState | null;
  readonly roundResult: RoundResult | null;
  /** Decided at the end of a round; announced when the phase reaches 'game-won'. */
  readonly gameWinner: Side | null;
  readonly fastMoney: FastMoneyState | null;
  readonly fastMoneySkipped: boolean;
  /** Next event sequence number; never rewound, not even by UNDO. */
  readonly seq: number;
  readonly events: readonly FeudEvent[];
  readonly history: readonly FeudSnapshot[];
}

// ---------------------------------------------------------------- actions

export type FeudAction =
  | { readonly type: 'START_GAME'; readonly settings?: Partial<FeudSettings> | undefined }
  | { readonly type: 'START_ROUND'; readonly survey: FeudSurveyInput }
  | { readonly type: 'OPEN_BUZZERS' }
  | { readonly type: 'BUZZ'; readonly team: Side; readonly at: number }
  /** Host resolution when phones disagree or lag: this family buzzed first. */
  | { readonly type: 'WHO_BUZZED_FIRST'; readonly team: Side }
  | { readonly type: 'FACEOFF_ANSWER'; readonly slot: number | 'miss' }
  | { readonly type: 'PLAY' }
  | { readonly type: 'PASS' }
  | {
      readonly type: 'ANSWER';
      readonly slot: number | 'miss' | 'repeat';
      /** Why a miss happened, for the presentation only. */
      readonly cause?: 'miss' | 'pass' | 'timeout' | undefined;
    }
  /** The steal huddle is over; the captain is about to answer. */
  | { readonly type: 'END_CONFER' }
  | { readonly type: 'STEAL_ANSWER'; readonly slot: number | 'miss' }
  | { readonly type: 'REVEAL_NEXT' }
  | { readonly type: 'REVEAL_ALL' }
  | { readonly type: 'NEXT_ROUND' }
  | { readonly type: 'START_SUDDEN_DEATH'; readonly survey: FeudSurveyInput }
  | { readonly type: 'SET_MULTIPLIER'; readonly multiplier: 1 | 2 | 3 }
  | { readonly type: 'REPLACE_SURVEY'; readonly survey: FeudSurveyInput }
  | { readonly type: 'SKIP_FAST_MONEY' }
  | { readonly type: 'FAST_MONEY'; readonly sub: FastMoneyAction }
  | { readonly type: 'UNDO' };

export type FeudActionType = FeudAction['type'];

/** What a game reports to the event layer when it ends (FR-037), exactly once. */
export interface GameEndReport {
  readonly winnerId: string;
  /** The winner's game score plus Fast Money points. */
  readonly points: number;
  readonly extraScores: readonly { readonly team: string; readonly points: number }[];
  /** 1 when Fast Money reached 200, else 0. The winner's own chip is credited by the event layer. */
  readonly bonusChips: 0 | 1;
}
