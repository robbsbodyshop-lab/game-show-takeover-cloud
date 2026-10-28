/**
 * Family Feud main-game reducer. Implements docs/FAMILY_FEUD_RULES.md, section The main game
 * (rules 1-8), requirements FR-030 and FR-032 and design.md section 8.1. Fast Money lives in
 * fastMoney.ts and is wrapped by the FAST_MONEY action.
 *
 * Contract (P-003): (state, action) => state; an illegal action returns the very same object;
 * presentation events carry a monotonic `seq` that UNDO never rewinds; history holds 30 steps.
 * No randomness and no content picking in here: surveys arrive in actions. Judging is outside:
 * the controller turns text into a slot or 'miss' (see src/judging).
 */
import {
  FINAL_REGULAR_ROUND,
  buildBoard,
  computeBank,
  isCleared,
  isValidSlot,
  isValidSurvey,
  leftoverOrder,
  multiplierForRound,
  revealSlot,
} from './board';
import { createFastMoney, reduceFastMoney } from './fastMoney';
import {
  DEFAULT_SETTINGS,
  otherSide,
  type BoardSlot,
  type FaceOffState,
  type FeudAction,
  type FeudEventPayload,
  type FeudFamily,
  type FeudSettings,
  type FeudSnapshot,
  type FeudState,
  type FeudSurveyInput,
  type RevealVia,
  type RoundHow,
  type Side,
} from './types';

export const MAX_HISTORY = 30;
export const MAX_EVENTS = 200;
/** Strikes that hand the board to the other family (rules, Main game 5). */
export const STRIKE_LIMIT = 3;

// ---------------------------------------------------------------- setup

export interface FeudSetup {
  readonly families: Readonly<Record<Side, { readonly teamId: string; readonly podiumSize: number }>>;
  readonly settings?: Partial<FeudSettings> | undefined;
}

const TARGETS: readonly number[] = [200, 300, 400, 500];

export const sanitizeSettings = (partial: Partial<FeudSettings> | undefined): FeudSettings => {
  const merged = { ...DEFAULT_SETTINGS, ...partial };
  return {
    targetScore: TARGETS.includes(merged.targetScore) ? merged.targetScore : 300,
    format: merged.format === 'one-round' ? 'one-round' : 'full',
    fastMoneyEnabled: merged.fastMoneyEnabled,
    answerTimerSec:
      Number.isFinite(merged.answerTimerSec) && merged.answerTimerSec >= 0
        ? merged.answerTimerSec
        : DEFAULT_SETTINGS.answerTimerSec,
    stealTimerSec: merged.stealTimerSec === 15 || merged.stealTimerSec === 30 ? merged.stealTimerSec : 0,
  };
};

const makeFamily = (init: { teamId: string; podiumSize: number }): FeudFamily => ({
  teamId: init.teamId,
  podiumSize: Math.max(1, Math.floor(init.podiumSize) || 1),
  score: 0,
});

export const createFeudState = (setup: FeudSetup): FeudState => ({
  phase: 'pre-game',
  settings: sanitizeSettings(setup.settings),
  families: { A: makeFamily(setup.families.A), B: makeFamily(setup.families.B) },
  roundNumber: 0,
  multiplier: 1,
  suddenDeath: false,
  survey: null,
  board: [],
  strikes: 0,
  bank: 0,
  faceOff: null,
  control: null,
  steal: null,
  roundResult: null,
  gameWinner: null,
  fastMoney: null,
  fastMoneySkipped: false,
  seq: 0,
  events: [],
  history: [],
});

// ---------------------------------------------------------------- helpers

const emit = (
  state: FeudState,
  patch: Partial<FeudState>,
  payloads: readonly FeudEventPayload[] = [],
): FeudState => {
  let seq = state.seq;
  const added = payloads.map((payload) => ({ ...payload, seq: seq++ }));
  const events = added.length > 0 ? [...state.events, ...added].slice(-MAX_EVENTS) : state.events;
  return { ...state, ...patch, seq, events };
};

const setFamily = (families: FeudState['families'], side: Side, family: FeudFamily): FeudState['families'] =>
  side === 'A' ? { A: family, B: families.B } : { A: families.A, B: family };

const isSide = (value: unknown): value is Side => value === 'A' || value === 'B';

/** Podium index of a family's player in the current face-off pair (rules, Main game 2). */
export const faceOffPlayer = (state: FeudState, side: Side, pair: number): number =>
  (Math.max(state.roundNumber, 1) - 1 + pair) % state.families[side].podiumSize;

const nextPlayer = (state: FeudState, side: Side, player: number): number =>
  (player + 1) % state.families[side].podiumSize;

const hasHidden = (board: readonly BoardSlot[]): boolean => board.some((slot) => !slot.revealed);

const freshFaceOff = (): FaceOffState => ({
  stage: 'ready',
  pair: 0,
  first: null,
  firstSlot: null,
  winner: null,
  winnerPlayer: null,
});

/** Round-scoped fields reset when a survey is loaded or replaced. */
const loadSurvey = (state: FeudState, survey: FeudSurveyInput, suddenDeath: boolean): Partial<FeudState> => ({
  survey: { id: survey.id, question: survey.question, surveyed: survey.surveyed },
  board: buildBoard(survey, suddenDeath),
  multiplier: multiplierForRound(state.roundNumber, suddenDeath),
  suddenDeath,
  strikes: 0,
  bank: 0,
  faceOff: freshFaceOff(),
  control: null,
  steal: null,
  roundResult: null,
  phase: 'face-off',
});

const clearedRound = (): Partial<FeudState> => ({
  survey: null,
  board: [],
  strikes: 0,
  bank: 0,
  faceOff: null,
  control: null,
  steal: null,
  roundResult: null,
});

const revealed = (
  state: FeudState,
  slot: number,
  by: Side | 'host',
  via: RevealVia,
): { patch: Partial<FeudState>; event: FeudEventPayload } => {
  const board = revealSlot(state.board, slot, by, via);
  const entry = state.board[slot];
  return {
    patch: { board, bank: computeBank(board, state.multiplier) },
    event: {
      type: 'ANSWER_REVEALED',
      slot,
      by,
      via,
      answer: entry?.answer ?? '',
      points: entry?.points ?? 0,
    },
  };
};

/** The round is decided: the bank goes to the winner and the win check runs (rules, Main game 1). */
const decideRound = (
  state: FeudState,
  winner: Side,
  how: RoundHow,
  patch: Partial<FeudState>,
  before: readonly FeudEventPayload[],
): FeudState => {
  const board = patch.board ?? state.board;
  const bank = computeBank(board, state.multiplier);
  const family = state.families[winner];
  const families = setFamily(state.families, winner, { ...family, score: family.score + bank });
  const reachedTarget = families[winner].score >= state.settings.targetScore;
  const gameWinner =
    state.suddenDeath || state.settings.format === 'one-round' || reachedTarget ? winner : null;
  const leftovers = hasHidden(board);
  return emit(
    state,
    {
      ...patch,
      bank,
      families,
      roundResult: { winner, bank, how },
      gameWinner,
      phase: leftovers ? 'round-decided' : 'round-summary',
    },
    [
      ...before,
      { type: 'ROUND_DECIDED', winner, bank, how },
      ...(leftovers ? [] : ([{ type: 'ROUND_SUMMARY' }] as const)),
    ],
  );
};

// ---------------------------------------------------------------- face-off

const winFaceOff = (
  state: FeudState,
  faceOff: FaceOffState,
  side: Side,
  patch: Partial<FeudState>,
  before: readonly FeudEventPayload[],
): FeudState => {
  const player = faceOffPlayer(state, side, faceOff.pair);
  const won: FaceOffState = { ...faceOff, stage: 'won', winner: side, winnerPlayer: player };
  const events: FeudEventPayload[] = [...before, { type: 'FACEOFF_WON', side, player }];
  if (state.suddenDeath) {
    // Sudden Death is a face-off only: the #1 answer wins the round and the game.
    return decideRound(state, side, 'sudden-death', { ...patch, faceOff: won }, events);
  }
  return emit(state, { ...patch, faceOff: won, phase: 'play-or-pass' }, events);
};

const faceOffAnswer = (state: FeudState, rawSlot: number | 'miss'): FeudState => {
  const faceOff = state.faceOff;
  if (state.phase !== 'face-off' || faceOff?.first == null) return state;
  if (faceOff.stage !== 'first-answer' && faceOff.stage !== 'second-answer') return state;
  // Sudden Death: any answer other than the #1 is a miss, even one the board does not show.
  const offBoard = typeof rawSlot === 'number' && Number.isInteger(rawSlot) && rawSlot >= 0 && rawSlot !== 0;
  const slot: number | 'miss' = state.suddenDeath && offBoard ? 'miss' : rawSlot;
  if (slot !== 'miss' && !isValidSlot(state.board, slot)) return state;
  const first = faceOff.first;
  const second = otherSide(first);

  if (faceOff.stage === 'first-answer') {
    if (slot === 'miss') {
      return emit(state, { faceOff: { ...faceOff, stage: 'second-answer', firstSlot: null } }, [
        { type: 'FACEOFF_X', side: first },
      ]);
    }
    if (state.board[slot]?.revealed) return state;
    const shown = revealed(state, slot, first, 'faceoff');
    if (slot === 0) return winFaceOff(state, faceOff, first, shown.patch, [shown.event]);
    return emit(state, { ...shown.patch, faceOff: { ...faceOff, stage: 'second-answer', firstSlot: slot } }, [
      shown.event,
    ]);
  }

  // second-answer
  if (faceOff.firstSlot === null) {
    // The first player missed: any answer on the board wins for the opponent.
    if (slot === 'miss') {
      const x: FeudEventPayload = { type: 'FACEOFF_X', side: second };
      if (state.suddenDeath) {
        return emit(state, { ...clearedRound(), faceOff: null, phase: 'sudden-death' }, [
          x,
          { type: 'SUDDEN_DEATH_READY', retry: true },
        ]);
      }
      // Both missed: down the line in pairs, the first family answering first each time.
      const pair = faceOff.pair + 1;
      return emit(state, { faceOff: { ...faceOff, stage: 'first-answer', pair, firstSlot: null } }, [
        x,
        { type: 'DOWN_THE_LINE', pair },
      ]);
    }
    if (state.board[slot]?.revealed) return state;
    const shown = revealed(state, slot, second, 'faceoff');
    return winFaceOff(state, faceOff, second, shown.patch, [shown.event]);
  }

  // The first player gave a non-#1 board answer (already revealed).
  if (slot === 'miss') {
    return winFaceOff(state, faceOff, first, {}, [{ type: 'FACEOFF_X', side: second }]);
  }
  const firstPoints = state.board[faceOff.firstSlot]?.points ?? 0;
  const secondPoints = state.board[slot]?.points ?? 0;
  // Higher points win for the opponent; equal points keep the face-off with the first family.
  const winner = secondPoints > firstPoints ? second : first;
  const hidden = state.board[slot]?.revealed === false;
  const shown = hidden ? revealed(state, slot, second, 'faceoff') : null;
  return winFaceOff(state, faceOff, winner, shown?.patch ?? {}, shown ? [shown.event] : []);
};

// ---------------------------------------------------------------- play or pass, control

const chooseControl = (state: FeudState, choice: 'play' | 'pass'): FeudState => {
  const faceOff = state.faceOff;
  if (state.phase !== 'play-or-pass' || faceOff?.winner == null || faceOff.winnerPlayer === null)
    return state;
  const winner = faceOff.winner;
  const family = choice === 'play' ? winner : otherSide(winner);
  // Control starts after the face-off winner; a passed family starts after its own face-off player.
  const anchor = choice === 'play' ? faceOff.winnerPlayer : faceOffPlayer(state, family, faceOff.pair);
  const control = { family, player: nextPlayer(state, family, anchor), passed: choice === 'pass' };
  const chosen: FeudEventPayload = { type: 'CONTROL_CHOSEN', choice, family };
  if (isCleared(state.board)) return decideRound(state, family, 'cleared', { control }, [chosen]);
  return emit(state, { phase: 'control', control, strikes: 0 }, [chosen]);
};

const controlAnswer = (
  state: FeudState,
  slot: number | 'miss' | 'repeat',
  cause: 'miss' | 'pass' | 'timeout' | undefined,
): FeudState => {
  const control = state.control;
  if (state.phase !== 'control' || control === null) return state;
  if (slot !== 'miss' && slot !== 'repeat' && !isValidSlot(state.board, slot)) return state;

  // Repeating an answer already on the board is not a strike (app choice, rules Main game 4).
  if (slot === 'repeat' || (slot !== 'miss' && state.board[slot]?.revealed === true)) {
    return emit(state, {}, [{ type: 'REPEAT', family: control.family, player: control.player }]);
  }

  const advanced = { ...control, player: nextPlayer(state, control.family, control.player) };
  if (slot === 'miss') {
    const strikes = state.strikes + 1;
    const strike: FeudEventPayload = {
      type: 'STRIKE',
      family: control.family,
      strikes,
      cause: cause ?? 'miss',
    };
    if (strikes >= STRIKE_LIMIT) {
      const stealer = otherSide(control.family);
      return emit(
        state,
        {
          strikes,
          control: advanced,
          steal: { family: stealer, result: 'pending', slot: null },
          phase: 'steal-confer',
        },
        [strike, { type: 'STEAL_CONFER', family: stealer, seconds: state.settings.stealTimerSec }],
      );
    }
    return emit(state, { strikes, control: advanced }, [strike]);
  }

  const shown = revealed(state, slot, control.family, 'control');
  const board = shown.patch.board ?? state.board;
  if (isCleared(board)) {
    // Clearing the board before the third strike wins the bank outright, no steal.
    return decideRound(state, control.family, 'cleared', { ...shown.patch, control: advanced }, [
      shown.event,
    ]);
  }
  return emit(state, { ...shown.patch, control: advanced }, [shown.event]);
};

// ---------------------------------------------------------------- steal

const stealAnswer = (state: FeudState, slot: number | 'miss'): FeudState => {
  const steal = state.steal;
  const control = state.control;
  if (
    (state.phase !== 'steal-confer' && state.phase !== 'steal-answer') ||
    steal === null ||
    control === null
  ) {
    return state;
  }
  if (slot !== 'miss' && !isValidSlot(state.board, slot)) return state;

  // Only an answer still hidden on the board steals.
  const hit = slot !== 'miss' && state.board[slot]?.revealed === false;
  if (hit) {
    const shown = revealed(state, slot, steal.family, 'steal');
    return decideRound(
      state,
      steal.family,
      'steal-success',
      { ...shown.patch, steal: { ...steal, result: 'success', slot } },
      [shown.event, { type: 'STEAL_RESULT', family: steal.family, success: true }],
    );
  }
  return decideRound(
    state,
    control.family,
    'steal-fail',
    { steal: { ...steal, result: 'fail', slot: null } },
    [{ type: 'STEAL_RESULT', family: steal.family, success: false }],
  );
};

// ---------------------------------------------------------------- after the round

const revealLeftovers = (state: FeudState, all: boolean): FeudState => {
  if (state.phase !== 'round-decided') return state;
  const order = leftoverOrder(state.board);
  const targets = all ? order : order.slice(0, 1);
  if (targets.length === 0) return state;
  let board = state.board;
  const events: FeudEventPayload[] = [];
  for (const slot of targets) {
    board = revealSlot(board, slot, 'host', 'leftover');
    const entry = state.board[slot];
    events.push({
      type: 'ANSWER_REVEALED',
      slot,
      by: 'host',
      via: 'leftover',
      answer: entry?.answer ?? '',
      points: entry?.points ?? 0,
    });
  }
  const done = !hasHidden(board);
  if (done) events.push({ type: 'ROUND_SUMMARY' });
  return emit(state, { board, phase: done ? 'round-summary' : 'round-decided' }, events);
};

const nextRound = (state: FeudState): FeudState => {
  if (state.phase !== 'round-summary') return state;
  const winner = state.gameWinner;
  if (winner !== null) {
    const reason = state.suddenDeath
      ? 'sudden-death'
      : state.settings.format === 'one-round'
        ? 'one-round'
        : 'target';
    const fastMoney = state.settings.fastMoneyEnabled
      ? createFastMoney({ family: winner, podiumSize: state.families[winner].podiumSize })
      : null;
    return emit(state, { phase: 'game-won', fastMoney }, [{ type: 'GAME_WON', winner, reason }]);
  }
  const round = state.roundNumber + 1;
  if (state.roundNumber >= FINAL_REGULAR_ROUND) {
    return emit(
      state,
      {
        ...clearedRound(),
        phase: 'sudden-death',
        roundNumber: round,
        suddenDeath: true,
        multiplier: multiplierForRound(round, true),
      },
      [{ type: 'SUDDEN_DEATH_READY', retry: false }],
    );
  }
  return emit(
    state,
    {
      ...clearedRound(),
      phase: 'round-intro',
      roundNumber: round,
      multiplier: multiplierForRound(round, false),
    },
    [{ type: 'NEXT_ROUND', round }],
  );
};

// ---------------------------------------------------------------- reducer

const ROUND_PHASES: readonly string[] = [
  'face-off',
  'play-or-pass',
  'control',
  'steal-confer',
  'steal-answer',
];

function reduceInner(state: FeudState, action: FeudAction): FeudState {
  switch (action.type) {
    case 'START_GAME': {
      if (state.phase !== 'pre-game') return state;
      const settings = sanitizeSettings({ ...state.settings, ...action.settings });
      return emit(
        state,
        { phase: 'round-intro', settings, roundNumber: 1, multiplier: multiplierForRound(1, false) },
        [{ type: 'GAME_STARTED' }],
      );
    }
    case 'START_ROUND': {
      if (state.phase !== 'round-intro' || !isValidSurvey(action.survey)) return state;
      const patch = loadSurvey(state, action.survey, false);
      return emit(state, patch, [
        {
          type: 'ROUND_STARTED',
          round: state.roundNumber,
          multiplier: patch.multiplier ?? 1,
          slots: patch.board?.length ?? 0,
          suddenDeath: false,
        },
      ]);
    }
    case 'START_SUDDEN_DEATH': {
      if (state.phase !== 'sudden-death' || !isValidSurvey(action.survey)) return state;
      const patch = loadSurvey(state, action.survey, true);
      return emit(state, patch, [
        {
          type: 'ROUND_STARTED',
          round: state.roundNumber,
          multiplier: patch.multiplier ?? 3,
          slots: patch.board?.length ?? 0,
          suddenDeath: true,
        },
      ]);
    }
    case 'REPLACE_SURVEY': {
      if (!ROUND_PHASES.includes(state.phase) || !isValidSurvey(action.survey)) return state;
      // The question is thrown out: the round restarts at the face-off with the same players.
      const patch = loadSurvey(state, action.survey, state.suddenDeath);
      return emit(state, { ...patch, multiplier: state.multiplier }, [{ type: 'SURVEY_REPLACED' }]);
    }
    case 'SET_MULTIPLIER': {
      if (!ROUND_PHASES.includes(state.phase) || state.suddenDeath) return state;
      const multiplier: number = action.multiplier;
      if (multiplier !== 1 && multiplier !== 2 && multiplier !== 3) return state;
      if (multiplier === state.multiplier) return state;
      return emit(state, { multiplier, bank: computeBank(state.board, multiplier) }, [
        { type: 'MULTIPLIER_SET', multiplier },
      ]);
    }
    case 'OPEN_BUZZERS': {
      const faceOff = state.faceOff;
      if (state.phase !== 'face-off' || faceOff?.stage !== 'ready') return state;
      return emit(state, { faceOff: { ...faceOff, stage: 'buzzers-open' } }, [{ type: 'BUZZERS_OPENED' }]);
    }
    case 'BUZZ': {
      const faceOff = state.faceOff;
      if (state.phase !== 'face-off' || faceOff?.stage !== 'buzzers-open') return state;
      if (!isSide(action.team) || !Number.isFinite(action.at)) return state;
      return emit(state, { faceOff: { ...faceOff, stage: 'first-answer', first: action.team } }, [
        { type: 'BUZZED', team: action.team, at: action.at },
      ]);
    }
    case 'WHO_BUZZED_FIRST': {
      const faceOff = state.faceOff;
      if (state.phase !== 'face-off' || faceOff?.pair !== 0 || !isSide(action.team)) return state;
      if (faceOff.stage !== 'ready' && faceOff.stage !== 'buzzers-open' && faceOff.stage !== 'first-answer') {
        return state;
      }
      if (faceOff.stage === 'first-answer' && faceOff.first === action.team) return state;
      return emit(state, { faceOff: { ...faceOff, stage: 'first-answer', first: action.team } }, [
        { type: 'BUZZER_ASSIGNED', team: action.team },
      ]);
    }
    case 'FACEOFF_ANSWER':
      return faceOffAnswer(state, action.slot);
    case 'PLAY':
      return chooseControl(state, 'play');
    case 'PASS':
      return chooseControl(state, 'pass');
    case 'ANSWER':
      return controlAnswer(state, action.slot, action.cause);
    case 'END_CONFER': {
      const steal = state.steal;
      if (state.phase !== 'steal-confer' || steal === null) return state;
      return emit(state, { phase: 'steal-answer' }, [{ type: 'STEAL_ANSWERING', family: steal.family }]);
    }
    case 'STEAL_ANSWER':
      return stealAnswer(state, action.slot);
    case 'REVEAL_NEXT':
      return revealLeftovers(state, false);
    case 'REVEAL_ALL':
      return revealLeftovers(state, true);
    case 'NEXT_ROUND':
      return nextRound(state);
    case 'SKIP_FAST_MONEY': {
      // Skipping is only possible before Player 1's clock has started.
      const fmPhase = state.fastMoney?.phase;
      const waiting = state.phase === 'fast-money' && (fmPhase === 'setup' || fmPhase === 'p1-ready');
      if (state.phase !== 'game-won' && !waiting) return state;
      return emit(state, { phase: 'game-over', fastMoney: null, fastMoneySkipped: true }, [
        { type: 'FAST_MONEY_SKIPPED' },
        { type: 'GAME_OVER' },
      ]);
    }
    case 'FAST_MONEY': {
      const fm = state.fastMoney;
      if ((state.phase !== 'game-won' && state.phase !== 'fast-money') || fm === null) return state;
      const next = reduceFastMoney(fm, action.sub);
      if (next === fm) return state;
      const fresh = next.events.filter((event) => event.seq >= fm.seq);
      const done = next.phase === 'done';
      return emit(state, { fastMoney: next, phase: done ? 'game-over' : 'fast-money' }, [
        ...fresh.map((event): FeudEventPayload => ({ type: 'FAST_MONEY', event })),
        ...(done ? [{ type: 'GAME_OVER' } satisfies FeudEventPayload] : []),
      ]);
    }
    case 'UNDO':
      return state;
  }
}

const snapshotOf = (state: FeudState): FeudSnapshot => ({
  phase: state.phase,
  settings: state.settings,
  families: state.families,
  roundNumber: state.roundNumber,
  multiplier: state.multiplier,
  suddenDeath: state.suddenDeath,
  survey: state.survey,
  board: state.board,
  strikes: state.strikes,
  bank: state.bank,
  faceOff: state.faceOff,
  control: state.control,
  steal: state.steal,
  roundResult: state.roundResult,
  gameWinner: state.gameWinner,
  fastMoney: state.fastMoney,
  fastMoneySkipped: state.fastMoneySkipped,
});

const undo = (state: FeudState): FeudState => {
  const previous = state.history.at(-1);
  if (previous === undefined || state.phase === 'game-over') return state;
  let fastMoney = previous.fastMoney;
  const current = state.fastMoney;
  if (
    fastMoney !== null &&
    current !== null &&
    (fastMoney.phase === 'p1-playing' || fastMoney.phase === 'p2-playing')
  ) {
    // The Fast Money clock keeps its real remaining time across an undo, but stays paused.
    const samePhase = fastMoney.phase === current.phase;
    fastMoney = {
      ...fastMoney,
      clock: {
        remainingMs:
          samePhase && current.clock.remainingMs > 0
            ? current.clock.remainingMs
            : fastMoney.clock.remainingMs,
        running: samePhase ? current.clock.running : false,
      },
    };
  }
  return emit({ ...state, ...previous, fastMoney, history: state.history.slice(0, -1) }, {}, [
    { type: 'UNDONE' },
  ]);
};

const isTick = (action: FeudAction): boolean => action.type === 'FAST_MONEY' && action.sub.type === 'TICK';

export function feudReducer(state: FeudState, action: FeudAction): FeudState {
  if (action.type === 'UNDO') return undo(state);
  const next = reduceInner(state, action);
  if (next === state) return state;
  // Clock ticks arrive many times a second and are not worth an undo step.
  if (isTick(action)) return next;
  return { ...next, history: [...state.history, snapshotOf(state)].slice(-MAX_HISTORY) };
}
