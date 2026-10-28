/**
 * Family Feud selectors. P-002: hidden information (unrevealed answers, aliases, Fast Money
 * answers before their reveal) leaves the engine only through `hostView`; the stage receives
 * `audienceView`, which carries `{ revealed: false }` for hidden slots and nothing else.
 */
import { fullBoardBank } from './board';
import { feudReducer, faceOffPlayer } from './feudEngine';
import {
  activePlayer,
  currentQuestionIndex,
  fastMoneyTotal,
  legalFastMoneyActions,
  rawPoints,
  shownPoints,
  REVEAL_STEPS,
} from './fastMoney';
import {
  otherSide,
  type BoardSlot,
  type FastMoneyAction,
  type FastMoneyClock,
  type FastMoneyEvent,
  type FastMoneyPhase,
  type FastMoneyPlayer,
  type FastMoneyState,
  type FeudAction,
  type FeudActionType,
  type FeudEvent,
  type FeudFamily,
  type FeudPhase,
  type FeudSettings,
  type FeudState,
  type FeudSurveyInput,
  type GameEndReport,
  type RevealVia,
  type RoundHow,
  type Side,
} from './types';

// ---------------------------------------------------------------- who is answering

export type AnsweringRole = 'face-off' | 'control' | 'steal' | 'fast-money';

export interface Answering {
  readonly side: Side;
  /** Podium index (0 is the captain). */
  readonly playerIndex: number;
  readonly role: AnsweringRole;
}

export const whoIsAnswering = (state: FeudState): Answering | null => {
  if (state.phase === 'face-off' && state.faceOff !== null) {
    const { stage, first, pair } = state.faceOff;
    if (first === null) return null;
    if (stage === 'first-answer')
      return { side: first, playerIndex: faceOffPlayer(state, first, pair), role: 'face-off' };
    if (stage === 'second-answer') {
      const second = otherSide(first);
      return { side: second, playerIndex: faceOffPlayer(state, second, pair), role: 'face-off' };
    }
    return null;
  }
  if (state.phase === 'control' && state.control !== null) {
    return { side: state.control.family, playerIndex: state.control.player, role: 'control' };
  }
  if (state.phase === 'steal-answer' && state.steal !== null) {
    // The captain gives the one steal answer.
    return { side: state.steal.family, playerIndex: 0, role: 'steal' };
  }
  const fm = state.fastMoney;
  if (state.phase === 'fast-money' && fm?.players != null) {
    const player = activePlayer(fm);
    if (player !== null) {
      return {
        side: fm.family,
        playerIndex: player === 1 ? fm.players.p1 : fm.players.p2,
        role: 'fast-money',
      };
    }
  }
  return null;
};

// ---------------------------------------------------------------- legal actions

const PROBE_SURVEY: FeudSurveyInput = {
  id: 'probe',
  question: '?',
  answers: [
    { answer: 'a', points: 2 },
    { answer: 'b', points: 1 },
  ],
};

const PROBES: readonly FeudAction[] = [
  { type: 'START_GAME' },
  { type: 'START_ROUND', survey: PROBE_SURVEY },
  { type: 'OPEN_BUZZERS' },
  { type: 'BUZZ', team: 'A', at: 0 },
  { type: 'WHO_BUZZED_FIRST', team: 'A' },
  { type: 'WHO_BUZZED_FIRST', team: 'B' },
  { type: 'FACEOFF_ANSWER', slot: 'miss' },
  { type: 'FACEOFF_ANSWER', slot: 0 },
  { type: 'PLAY' },
  { type: 'PASS' },
  { type: 'ANSWER', slot: 'miss' },
  { type: 'ANSWER', slot: 'repeat' },
  { type: 'END_CONFER' },
  { type: 'STEAL_ANSWER', slot: 'miss' },
  { type: 'REVEAL_NEXT' },
  { type: 'REVEAL_ALL' },
  { type: 'NEXT_ROUND' },
  { type: 'START_SUDDEN_DEATH', survey: PROBE_SURVEY },
  { type: 'SET_MULTIPLIER', multiplier: 2 },
  { type: 'SET_MULTIPLIER', multiplier: 3 },
  { type: 'REPLACE_SURVEY', survey: PROBE_SURVEY },
  { type: 'SKIP_FAST_MONEY' },
  { type: 'UNDO' },
];

/**
 * Action types the reducer would accept right now. Found by trying a representative action of
 * each type, so it can never disagree with the reducer. FAST_MONEY is listed when any
 * Fast Money sub-action is legal; see `legalFastMoney` for which.
 */
export const legalActions = (state: FeudState): FeudActionType[] => {
  const legal = new Set<FeudActionType>();
  for (const probe of PROBES) {
    if (feudReducer(state, probe) !== state) legal.add(probe.type);
  }
  if (legalFastMoney(state).length > 0) legal.add('FAST_MONEY');
  return [...legal];
};

export const legalFastMoney = (state: FeudState): FastMoneyAction['type'][] => {
  if ((state.phase !== 'game-won' && state.phase !== 'fast-money') || state.fastMoney === null) return [];
  return legalFastMoneyActions(state.fastMoney);
};

// ---------------------------------------------------------------- audience view

export type AudienceSlot =
  | { readonly revealed: false }
  | {
      readonly revealed: true;
      readonly answer: string;
      readonly points: number;
      readonly revealedBy: Side | 'host' | null;
      readonly via: RevealVia | null;
    };

export interface AudienceFamily {
  readonly side: Side;
  readonly teamId: string;
  readonly podiumSize: number;
  readonly score: number;
}

export interface AudienceFastMoneyRow {
  readonly question: string;
  readonly youSaid: string | null;
  readonly surveySaid: { readonly answer: string | null; readonly points: number } | null;
}

export interface AudienceFastMoney {
  readonly phase: FastMoneyPhase;
  readonly family: Side;
  readonly clock: FastMoneyClock;
  /** The question on screen: only while a player is answering (rules, Fast Money 2). */
  readonly question: string | null;
  readonly answering: FastMoneyPlayer | null;
  /** The player whose answers are being revealed, with only the rows revealed so far. */
  readonly revealing: FastMoneyPlayer | null;
  readonly rows: readonly AudienceFastMoneyRow[];
  readonly total: number;
  readonly p1Total: number | null;
  readonly outcome: FastMoneyState['outcome'];
}

export interface AudienceView {
  readonly phase: FeudPhase;
  readonly round: number;
  readonly multiplier: number;
  readonly suddenDeath: boolean;
  /** Shown from the face-off on. */
  readonly question: string | null;
  /** One entry per answer on the board; hidden slots carry nothing but `revealed: false`. */
  readonly board: readonly AudienceSlot[];
  readonly strikes: number;
  /** The multiplied bank shown above the board. */
  readonly bank: number;
  readonly families: Readonly<Record<Side, AudienceFamily>>;
  readonly control: Side | null;
  readonly stealing: Side | null;
  readonly answering: Answering | null;
  readonly faceOff: {
    readonly stage: string;
    readonly first: Side | null;
    readonly winner: Side | null;
  } | null;
  readonly roundResult: { readonly winner: Side; readonly bank: number; readonly how: RoundHow } | null;
  readonly gameWinner: Side | null;
  readonly fastMoney: AudienceFastMoney | null;
  readonly seq: number;
  readonly events: readonly FeudEvent[];
}

const audienceSlot = (slot: BoardSlot): AudienceSlot =>
  slot.revealed
    ? { revealed: true, answer: slot.answer, points: slot.points, revealedBy: slot.revealedBy, via: slot.via }
    : { revealed: false };

const SAFE_FM_EVENTS: ReadonlySet<FastMoneyEvent['type']> = new Set([
  'PLAYERS_CHOSEN',
  'CLOCK_STARTED',
  'CLOCK_PAUSED',
  'CLOCK_RESUMED',
  'TIME_UP',
  'QUESTION_SHOWN',
  'ANSWERED',
  'PASSED',
  'DUPLICATE',
  'ALL_ANSWERED',
  'YOU_SAID',
  'SURVEY_SAID',
  'BOARD_CLEARED',
  'FAST_MONEY_DONE',
]);

/** Event log for the stage: Fast Money host corrections are not presentation events. */
const audienceEvents = (events: readonly FeudEvent[]): FeudEvent[] =>
  events.filter((event) => event.type !== 'FAST_MONEY' || SAFE_FM_EVENTS.has(event.event.type));

const audienceFastMoney = (fm: FastMoneyState): AudienceFastMoney => {
  const answering = activePlayer(fm);
  const revealing: FastMoneyPlayer | null =
    fm.phase === 'p1-reveal' ? 1 : fm.phase === 'p2-reveal' ? 2 : null;
  const rows: AudienceFastMoneyRow[] = [];
  if (revealing !== null) {
    const steps = revealing === 1 ? fm.reveal.p1 : fm.reveal.p2;
    const records = revealing === 1 ? fm.records.p1 : fm.records.p2;
    for (let question = 0; question < fm.questions.length; question += 1) {
      if (steps <= question * 2) break;
      const record = records[question] ?? null;
      const matched =
        record !== null && record.slot !== null ? fm.questions[question]?.answers[record.slot] : undefined;
      rows.push({
        question: fm.questions[question]?.question ?? '',
        youSaid: record?.text ?? null,
        surveySaid:
          steps > question * 2 + 1 ? { answer: matched?.answer ?? null, points: matched?.points ?? 0 } : null,
      });
    }
  }
  const questionIndex = answering === null ? null : currentQuestionIndex(fm);
  const p1Done = fm.reveal.p1 >= REVEAL_STEPS;
  return {
    phase: fm.phase,
    family: fm.family,
    clock: fm.clock,
    question: questionIndex === null ? null : (fm.questions[questionIndex]?.question ?? null),
    answering,
    revealing,
    rows,
    total: fastMoneyTotal(fm),
    p1Total: p1Done ? shownPoints(fm, 1) : null,
    outcome: fm.outcome,
  };
};

const audienceFamilies = (state: FeudState): Record<Side, AudienceFamily> => {
  const make = (side: Side): AudienceFamily => {
    const family: FeudFamily = state.families[side];
    return { side, teamId: family.teamId, podiumSize: family.podiumSize, score: family.score };
  };
  return { A: make('A'), B: make('B') };
};

const ANNOUNCED_PHASES: readonly FeudPhase[] = ['game-won', 'fast-money', 'game-over'];
const RESULT_PHASES: readonly FeudPhase[] = ['round-decided', 'round-summary', ...ANNOUNCED_PHASES];

/** What the stage may see: no hidden answer text, no points, no aliases. */
export const audienceView = (state: FeudState): AudienceView => ({
  phase: state.phase,
  round: state.roundNumber,
  multiplier: state.multiplier,
  suddenDeath: state.suddenDeath,
  question: state.survey !== null && state.phase !== 'round-intro' ? state.survey.question : null,
  board: state.board.map(audienceSlot),
  strikes: state.strikes,
  bank: state.bank,
  families: audienceFamilies(state),
  control:
    state.phase === 'control' || state.phase === 'steal-confer' || state.phase === 'steal-answer'
      ? (state.control?.family ?? null)
      : null,
  stealing:
    state.phase === 'steal-confer' || state.phase === 'steal-answer' ? (state.steal?.family ?? null) : null,
  answering: whoIsAnswering(state),
  faceOff:
    state.faceOff === null
      ? null
      : { stage: state.faceOff.stage, first: state.faceOff.first, winner: state.faceOff.winner },
  roundResult: RESULT_PHASES.includes(state.phase) ? state.roundResult : null,
  gameWinner: ANNOUNCED_PHASES.includes(state.phase) ? state.gameWinner : null,
  fastMoney: state.fastMoney === null ? null : audienceFastMoney(state.fastMoney),
  seq: state.seq,
  events: audienceEvents(state.events),
});

// ---------------------------------------------------------------- host view

export interface StakeLine {
  readonly side: Side;
  readonly points: number;
  readonly reason: 'clear-board' | 'third-strike-steal' | 'steal-hit' | 'steal-miss';
}

export interface Stakes {
  /** "If they win": the family answering now succeeds. */
  readonly ifWin: StakeLine;
  /** "If they lose": the family answering now fails. */
  readonly ifLose: StakeLine;
}

/**
 * The stake lines the host reads out. In control: clearing the board wins everything, a third
 * strike hands the current bank to the other family if its steal hits. At the steal: a hit wins
 * the bank for the stealing family, a miss gives it to the controlling family.
 */
export const stakes = (state: FeudState): Stakes | null => {
  if (state.phase === 'control' && state.control !== null) {
    const family = state.control.family;
    return {
      ifWin: { side: family, points: fullBoardBank(state.board, state.multiplier), reason: 'clear-board' },
      ifLose: { side: otherSide(family), points: state.bank, reason: 'third-strike-steal' },
    };
  }
  if (
    (state.phase === 'steal-confer' || state.phase === 'steal-answer') &&
    state.steal !== null &&
    state.control !== null
  ) {
    return {
      ifWin: { side: state.steal.family, points: state.bank, reason: 'steal-hit' },
      ifLose: { side: state.control.family, points: state.bank, reason: 'steal-miss' },
    };
  }
  return null;
};

export interface HostView {
  readonly phase: FeudPhase;
  readonly settings: FeudSettings;
  readonly round: number;
  readonly multiplier: number;
  readonly suddenDeath: boolean;
  readonly survey: FeudState['survey'];
  /** The full board with every answer, points and alias. */
  readonly board: readonly BoardSlot[];
  /** What `matchAnswer` needs; slot order equals board order. */
  readonly judgeSurvey: {
    readonly answers: readonly { readonly answer: string; readonly aliases: readonly string[] }[];
  } | null;
  readonly strikes: number;
  readonly bank: number;
  readonly families: FeudState['families'];
  readonly faceOff: FeudState['faceOff'];
  readonly control: FeudState['control'];
  readonly steal: FeudState['steal'];
  readonly roundResult: FeudState['roundResult'];
  readonly gameWinner: Side | null;
  readonly answering: Answering | null;
  readonly stakes: Stakes | null;
  readonly legalActions: readonly FeudActionType[];
  readonly legalFastMoney: readonly FastMoneyAction['type'][];
  readonly canUndo: boolean;
  /** Full Fast Money state including answers; host only. */
  readonly fastMoney: FastMoneyState | null;
  readonly fastMoneyRaw: { readonly p1: number; readonly p2: number } | null;
  readonly seq: number;
  readonly events: readonly FeudEvent[];
}

export const hostView = (state: FeudState): HostView => ({
  phase: state.phase,
  settings: state.settings,
  round: state.roundNumber,
  multiplier: state.multiplier,
  suddenDeath: state.suddenDeath,
  survey: state.survey,
  board: state.board,
  judgeSurvey:
    state.board.length === 0
      ? null
      : { answers: state.board.map((slot) => ({ answer: slot.answer, aliases: slot.aliases })) },
  strikes: state.strikes,
  bank: state.bank,
  families: state.families,
  faceOff: state.faceOff,
  control: state.control,
  steal: state.steal,
  roundResult: state.roundResult,
  gameWinner: state.gameWinner,
  answering: whoIsAnswering(state),
  stakes: stakes(state),
  legalActions: legalActions(state),
  legalFastMoney: legalFastMoney(state),
  canUndo: state.history.length > 0 && state.phase !== 'game-over',
  fastMoney: state.fastMoney,
  fastMoneyRaw:
    state.fastMoney === null
      ? null
      : { p1: rawPoints(state.fastMoney, 1), p2: rawPoints(state.fastMoney, 2) },
  seq: state.seq,
  events: state.events,
});

// ---------------------------------------------------------------- game end

/** Fast Money points that count for the winner: those shown in the total. */
export const fastMoneyPoints = (state: FeudState): number =>
  state.fastMoney === null ? 0 : fastMoneyTotal(state.fastMoney);

/**
 * What the game reports to the event layer (FR-037), or null until the game is over. The winner
 * gets game score plus Fast Money points; the loser keeps its game score; 200 in Fast Money earns
 * a bonus chip (docs/FAMILY_FEUD_RULES.md, How it maps to the event).
 */
export const gameEndReport = (state: FeudState): GameEndReport | null => {
  if (state.phase !== 'game-over' || state.gameWinner === null) return null;
  const winner = state.gameWinner;
  const loser = otherSide(winner);
  const fm = state.fastMoney;
  return {
    winnerId: state.families[winner].teamId,
    points: state.families[winner].score + fastMoneyPoints(state),
    extraScores: [{ team: state.families[loser].teamId, points: state.families[loser].score }],
    bonusChips: fm !== null && fm.phase === 'done' && fm.outcome === 'jackpot' ? 1 : 0,
  };
};
