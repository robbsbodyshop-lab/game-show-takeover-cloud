/**
 * Event wrapper types. Implements design.md section 8.3 and HOST_FEATURE_INVENTORY.md
 * sections 1.1-1.3, 1.6 and 5.5. Plain serializable data only (no Set/Map/functions).
 */

export const MIN_TEAMS = 2;
export const MAX_TEAMS = 8;

export type GamePhase =
  'setup' | 'doors' | 'hub' | 'feud' | 'wheel' | 'speed' | 'plinko' | 'puzzle' | 'winner';

/** The two main games that run an engine of their own and report a winner. */
export type MainGameKind = 'feud' | 'wheel';

export interface Team {
  /** 1..8, equals the list place (scores and chips stay with a place, not a name). */
  id: number;
  name: string;
  color: string;
  players: string[];
  score: number;
  chips: number;
}

/** What the host edits; ids, scores and chips are managed by the reducer. */
export interface TeamEdit {
  name: string;
  color: string;
  players: string[];
}

export interface EventSettings {
  /** Speed Round clock length (FR-052: 60 s). */
  speedRoundMs: number;
  /** Plinko slot values left to right (TD-004; the owner may change them in Settings). */
  plinkoSlotValues: number[];
}

// --- Tournament -----------------------------------------------------------------------

export interface BracketMatch {
  round: number;
  slot: number;
  a: number | null;
  b: number | null;
  winner: number | null;
  /** True when the match was decided at creation because one side is a bye. */
  bye: boolean;
}

export interface BracketState {
  /** Team ids best seed first (the play order the bracket was built from). */
  seeds: number[];
  /** rounds[0] is the first round; the last round holds the single final. */
  rounds: BracketMatch[][];
}

// --- Doors ----------------------------------------------------------------------------

export type DoorsStage = 'picking' | 'revealing' | 'done';

export interface DoorPick {
  team: number;
  door: number;
}

export interface DoorsState {
  stage: DoorsStage;
  /** Equals the team count; doors are numbered 1..doorCount. */
  doorCount: number;
  picks: DoorPick[];
  /** positions[door - 1] is the play position (1 = first) behind that door; set on reveal. */
  positions: number[] | null;
}

// --- Plinko ---------------------------------------------------------------------------

export interface PlinkoDrop {
  team: number;
  column: number;
  /** Disc x after each peg row, in half-slot units (0..2 * (slots - 1)). */
  xs: number[];
  slot: number;
  points: number;
}

export interface PlinkoColumnSelection {
  team: number;
  column: number;
}

export interface PlinkoState {
  selections: PlinkoColumnSelection[];
  drops: PlinkoDrop[];
}

// --- Speed Round ----------------------------------------------------------------------

export type SpeedStatus = 'idle' | 'running' | 'paused' | 'timeUp';

export interface SpeedState {
  status: SpeedStatus;
  durationMs: number;
  /** Epoch ms at which the clock reaches zero; null unless running. */
  endsAt: number | null;
  /** Time left when not running; the value frozen at pause, full length when idle, 0 at time up. */
  remainingMs: number;
}

// --- Session --------------------------------------------------------------------------

export interface RunningGame {
  kind: MainGameKind;
  /** Seed the game controller builds its engine from (kept so a reload before the first snapshot works). */
  instanceSeed: number;
  /** Latest engine snapshot reported through GAME_STATE; null until the first one. */
  state: unknown;
}

export interface EventSession {
  schemaVersion: 1;
  teams: Team[];
  phase: GamePhase;
  availableMainGames: MainGameKind[];
  completedGames: MainGameKind[];
  usedContentIds: string[];
  /** Team ids, first player first; null until doors or SET_PLAY_ORDER decide it. */
  playOrder: number[] | null;
  bracket: BracketState | null;
  /** Identifies the current/next game slot; bumped whenever a game ends or is abandoned. */
  gameInstance: number;
  game: RunningGame | null;
  doors: DoorsState | null;
  plinko: PlinkoState | null;
  speed: SpeedState | null;
  settings: EventSettings;
}

// --- Actions --------------------------------------------------------------------------

export interface ScoreAward {
  team: number;
  points: number;
}

export type EventAction =
  | { type: 'SET_TEAMS'; teams: TeamEdit[] }
  | { type: 'START_DOORS' }
  | { type: 'DOOR_PICK'; team: number; door: number }
  | { type: 'DOORS_REVEAL'; draw: number[] }
  | { type: 'SET_PLAY_ORDER'; order: number[] }
  | { type: 'START_GAME'; kind: MainGameKind; instanceSeed: number }
  | { type: 'GAME_STATE'; state: unknown }
  | {
      type: 'GAME_WON';
      winnerId: number;
      roundScore: number;
      extraScores?: ScoreAward[];
      bonusChips?: number;
      /** Instance the reporting controller was started with; stale reports are ignored. */
      gameInstance?: number;
    }
  | { type: 'ABANDON_GAME' }
  | { type: 'SCORE_CHANGE'; team: number; delta: number }
  | { type: 'CHIP_CHANGE'; team: number; delta: number }
  | { type: 'CONTENT_USED'; ids: string[] }
  | { type: 'START_SPEED' }
  | { type: 'SPEED_START'; now: number }
  | { type: 'SPEED_PAUSE'; now: number }
  | { type: 'SPEED_RESUME'; now: number }
  | { type: 'SPEED_TIME_UP'; now: number }
  | { type: 'SPEED_RESULT'; awards: ScoreAward[] }
  | { type: 'START_PLINKO' }
  | { type: 'PLINKO_SELECT_COLUMN'; team: number; column: number }
  | { type: 'PLINKO_DROP'; team: number; draw: number[] }
  | { type: 'END_PLINKO' }
  | { type: 'START_PUZZLE' }
  | { type: 'ANNOUNCE_WINNER' }
  | { type: 'GO_HUB' }
  | { type: 'NEW_EVENT' }
  | { type: 'RESET_SCORES' };

export type EventActionType = EventAction['type'];
