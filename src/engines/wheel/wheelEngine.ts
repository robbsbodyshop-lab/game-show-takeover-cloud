/**
 * Wheel of Fortune engine: `(state, action) => state`, plain data, illegal actions return the same
 * object, presentation events carry a monotonic `seq`, randomness (`draw`) and content (puzzles) are
 * injected. Rules of record: docs/WHEEL_OF_FORTUNE_RULES.md. Design: design.md 8.2.
 *
 * The engine asks for puzzles through `state.request`; the UI answers with PROVIDE_PUZZLES.
 */
import {
  bonusAcceptLate,
  bonusCallLetter,
  bonusSolve,
  bonusSpin,
  bonusThrowOut,
  bonusTimeUp,
  openEnvelope,
  pickCategory,
  resumeBonusWithNewPuzzle,
  startBonusClock,
} from './bonusFlow';
import {
  EVENT_LIMIT,
  HISTORY_LIMIT,
  emit,
  installNextPuzzle,
  isRoundLike,
  isTossupLike,
  mapTeam,
  playableInputs,
  resetForNewPuzzle,
  throwOutPuzzle,
} from './engineCore';
import { snapshotOf } from './engineCore';
import { buildPlan, collapseToSpeedUp } from './plan';
import { lightAll, lightNext } from './puzzleState';
import {
  buyVowel,
  callLetterAction,
  endRoundUnsolved,
  express,
  lateSolve,
  mystery,
  playWildCard,
  setTurn,
  skipTurn,
  solveCancel,
  solveRuling,
  solveStart,
  speedUpFromRound,
  speedUpSpin,
  spin,
  throwOutInPlay,
  timeOut,
} from './roundFlow';
import { advance, beginSegment, enterSegment, gameOver } from './segments';
import {
  endTossupUnsolved,
  frenzyTick,
  nextTriplePuzzle,
  starterAfter,
  tossupAnswer,
  tossupBuzz,
  tossupRevealNext,
} from './tossupFlow';
import { DEFAULT_WHEEL_SETTINGS } from './types';
import type { Snapshot, WheelAction, WheelActionType, WheelInit, WheelState } from './types';
import { FRESH_SPECIALS } from './wheels';

/** Actions that do not clear `timedOut` (so a late solve is still possible after them). */
export const KEEPS_TIMED_OUT: readonly WheelActionType[] = [
  'TIME_OUT',
  'LATE_SOLVE',
  'ADJUST_BANK',
  'SET_TURN_TIMER',
  'PROVIDE_PUZZLES',
  'RING_BELL',
  'LIGHT_NEXT',
  'LIGHT_ALL',
  'FRENZY_TICK',
  'TOSSUP_REVEAL_NEXT',
  'UNDO',
];

/** Actions that are not undo steps: presentation, clocks and settings. */
const NON_STEP: readonly WheelActionType[] = [
  'SET_TURN_TIMER',
  'LIGHT_NEXT',
  'LIGHT_ALL',
  'FRENZY_TICK',
  'TOSSUP_REVEAL_NEXT',
];

export function createWheelState(init: WheelInit): WheelState {
  if (init.teams.length === 0) throw new Error('The Wheel needs at least one team.');
  const settings = { ...DEFAULT_WHEEL_SETTINGS, ...init.settings };
  const base: WheelState = {
    version: 1,
    settings,
    teams: init.teams.map((t) => ({
      id: t.id,
      name: t.name,
      bank: 0,
      prizes: [],
      roundCash: 0,
      roundPrizes: [],
      wildCard: false,
      millionWedge: 'none',
      lockedOut: false,
    })),
    plan: buildPlan(settings),
    planIndex: 0,
    stage: 'tossup',
    phase: 'awaiting-puzzles',
    round: 0,
    bell: false,
    specials: { ...FRESH_SPECIALS },
    nextStarter: null,
    lastStarter: null,
    turn: null,
    puzzle: null,
    queue: [],
    request: null,
    awaiting: null,
    resumePhase: null,
    seen: [],
    spin: null,
    lastConsonant: null,
    solve: null,
    speedUp: null,
    turnDry: false,
    dryFails: 0,
    passedAt: null,
    timedOut: null,
    timedOutCtx: null,
    award: null,
    lastRuling: null,
    tossup: null,
    frenzy: null,
    triple: null,
    bonus: null,
    outcome: null,
    step: 0,
    history: [],
    events: [],
    eventSeq: 0,
  };
  return enterSegment(base);
}

/** Brings back an earlier snapshot but keeps what must never rewind: events, the turn timer, clocks. */
function restoreFrom(current: WheelState, snap: Snapshot): WheelState {
  let out: WheelState = {
    ...snap,
    history: current.history.slice(0, -1),
    events: current.events,
    eventSeq: current.eventSeq,
    settings: { ...snap.settings, turnTimerSec: current.settings.turnTimerSec },
  };
  // Toss-up letters already shown stay shown, and the Frenzy clock never runs backwards.
  const nowShown = current.puzzle;
  if (isTossupLike(out) && nowShown && out.puzzle?.puzzle.id === nowShown.puzzle.id) {
    out = { ...out, puzzle: nowShown };
  }
  if (out.frenzy && current.frenzy) {
    out = {
      ...out,
      frenzy: { ...out.frenzy, msLeft: current.frenzy.msLeft, started: current.frenzy.started },
    };
  }
  return out;
}

/** Once the bell has rung, a round in play becomes the Speed-Up at its next choice point. */
function settleBell(s: WheelState): WheelState {
  if (!s.bell || s.stage !== 'round' || s.phase !== 'choose' || !s.puzzle || s.turn === null) return s;
  return speedUpFromRound(s, collapseToSpeedUp(s.plan, s.planIndex));
}

function commit(prev: WheelState, next: WheelState, action: WheelAction): WheelState {
  let out = next;
  if (!NON_STEP.includes(action.type)) {
    out = { ...out, step: prev.step + 1, history: [...prev.history, snapshotOf(prev)].slice(-HISTORY_LIMIT) };
  }
  if (!KEEPS_TIMED_OUT.includes(action.type) && out.timedOut !== null) {
    out = { ...out, timedOut: null, timedOutCtx: null };
  }
  return settleBell(out);
}

function provide(s: WheelState, puzzles: WheelAction & { type: 'PROVIDE_PUZZLES' }): WheelState {
  if (s.phase !== 'awaiting-puzzles' || !s.request || !s.awaiting) return s;
  const usable = playableInputs(puzzles.puzzles);
  if (usable.length === 0) return s;
  const withQueue: WheelState = { ...s, queue: [...s.queue, ...usable] };
  if (s.awaiting === 'start') return beginSegment(withQueue);
  const installed = installNextPuzzle(withQueue);
  if (!installed) return s;
  return s.stage === 'bonus' ? resumeBonusWithNewPuzzle(installed) : resetForNewPuzzle(installed);
}

function continueFlow(s: WheelState): WheelState {
  switch (s.phase) {
    case 'tossup-done': {
      if (s.stage === 'triple') {
        const next = nextTriplePuzzle(s);
        if (next) return next;
      }
      const seg = s.plan[s.planIndex];
      let n = s;
      if (s.stage === 'tiebreak' && s.tossup?.solver == null) {
        // Nobody won the tiebreaker: another one is played.
        n = {
          ...n,
          plan: [
            ...n.plan.slice(0, n.planIndex + 1),
            { kind: 'tiebreak', value: s.tossup?.value ?? 1000 },
            ...n.plan.slice(n.planIndex + 1),
          ],
        };
      }
      const decidesStarter =
        s.stage === 'frenzy' ||
        s.stage === 'triple' ||
        (s.stage === 'tossup' && seg?.kind === 'tossup' && seg.starter);
      if (decidesStarter) n = { ...n, nextStarter: starterAfter(s) };
      return advance(n);
    }
    case 'round-award':
      return advance(s);
    case 'bonus-ready':
      return startBonusClock(s);
    case 'bonus-opened':
      return gameOver(s);
    default:
      return s;
  }
}

function dispatch(s: WheelState, a: WheelAction): WheelState {
  switch (a.type) {
    case 'SPIN':
      return spin(s, a.draw);
    case 'CALL_LETTER':
      return callLetterAction(s, a.letter, a.at);
    case 'BUY_VOWEL':
      return buyVowel(s, a.letter, a.at);
    case 'SOLVE_START':
      return solveStart(s);
    case 'SOLVE':
      return solveRuling(s, a.verdict);
    case 'SOLVE_CANCEL':
      return solveCancel(s);
    case 'BUZZ':
      return tossupBuzz(s, a.team, a.at);
    case 'TOSSUP_REVEAL_NEXT':
      return tossupRevealNext(s, a.draw);
    case 'TOSSUP_ANSWER':
      return tossupAnswer(s, a.team, a.verdict);
    case 'FRENZY_TICK':
      return frenzyTick(s, a.ms);
    case 'PLAY_WILD_CARD':
      return playWildCard(s);
    case 'MYSTERY':
      return mystery(s, a.choice, a.draw);
    case 'EXPRESS':
      return express(s, a.choice);
    case 'RING_BELL': {
      const blocked =
        s.stage === 'speedup' || s.stage === 'bonus' || s.stage === 'tiebreak' || s.stage === 'game-over';
      return s.bell || blocked ? s : emit({ ...s, bell: true }, 'bell');
    }
    case 'SPEEDUP_SPIN':
      return speedUpSpin(s, a.draw);
    case 'TIME_OUT':
      return timeOut(s, a.team, a.at);
    case 'LATE_SOLVE':
      return lateSolve(s);
    case 'HOST_SOLVE_OVERRIDE':
      return s; // handled in wheelReduce (needs the history)
    case 'SKIP_TURN':
      return skipTurn(s, a.at);
    case 'SET_TURN':
      return setTurn(s, a.team);
    case 'THROW_OUT_PUZZLE':
      if (isRoundLike(s)) return throwOutInPlay(s);
      if (isTossupLike(s) && s.puzzle && (s.phase === 'tossup-reveal' || s.phase === 'tossup-answer')) {
        return throwOutPuzzle(s);
      }
      return bonusThrowOut(s);
    case 'END_ROUND_UNSOLVED':
      return isRoundLike(s) ? endRoundUnsolved(s) : endTossupUnsolved(s);
    case 'ADJUST_BANK': {
      if (s.stage === 'game-over' || !Number.isFinite(a.delta) || a.delta === 0) return s;
      const team = s.teams.find((t) => t.id === a.team);
      if (!team) return s;
      const bank = Math.max(0, team.bank + Math.trunc(a.delta));
      if (bank === team.bank) return s;
      return emit(
        mapTeam(s, team.id, (t) => ({ ...t, bank })),
        'bank-adjusted',
        { team: team.id, amount: bank - team.bank },
      );
    }
    case 'SET_TURN_TIMER':
      return s.settings.turnTimerSec === a.sec
        ? s
        : { ...s, settings: { ...s.settings, turnTimerSec: a.sec } };
    case 'PROVIDE_PUZZLES':
      return provide(s, a);
    case 'BONUS_PICK_CATEGORY':
      return pickCategory(s, a.category);
    case 'BONUS_SPIN':
      return bonusSpin(s, a.draw);
    case 'BONUS_CALL_LETTER':
      return bonusCallLetter(s, a.letter);
    case 'BONUS_SOLVE':
      return bonusSolve(s, a.verdict);
    case 'BONUS_TIME_UP':
      return bonusTimeUp(s);
    case 'BONUS_ACCEPT_LATE':
      return bonusAcceptLate(s);
    case 'BONUS_OPEN_ENVELOPE':
      return openEnvelope(s);
    case 'CONTINUE':
      return continueFlow(s);
    case 'LIGHT_NEXT':
      return s.puzzle && s.puzzle.queue.length > 0 ? { ...s, puzzle: lightNext(s.puzzle) } : s;
    case 'LIGHT_ALL':
      return s.puzzle && s.puzzle.queue.length > 0 ? { ...s, puzzle: lightAll(s.puzzle) } : s;
    case 'UNDO':
      return s; // handled in wheelReduce
  }
}

/**
 * The host rules a solve. While a solve is open it is simply the ruling. Afterwards it reverses the
 * last ruling (only while nothing else has been done): a right ruling reversed throws the puzzle out
 * because every team has seen the answer; a wrong ruling reversed gives the solve to the team.
 */
function hostOverride(s: WheelState, verdict: 'correct' | 'wrong', action: WheelAction): WheelState {
  const open = (): WheelState => {
    if (s.phase === 'solving') return solveRuling(s, verdict);
    if (s.phase === 'tossup-answer' && s.tossup?.buzzed != null)
      return tossupAnswer(s, s.tossup.buzzed, verdict);
    if (s.stage === 'bonus') return bonusSolve(s, verdict);
    return s;
  };
  const ruling = s.lastRuling;
  const before = s.history[s.history.length - 1];
  const reversible =
    ruling !== null && before !== undefined && ruling.step === s.step && ruling.verdict !== verdict;
  if (!reversible) {
    const next = open();
    return next === s ? s : commit(s, next, action);
  }
  const restored = restoreFrom(s, before);
  const reversal = ruling.verdict === 'correct';
  let next: WheelState = restored;
  if (isRoundLike(restored)) next = solveRuling(restored, verdict, reversal);
  else if (isTossupLike(restored) && ruling.team !== null)
    next = tossupAnswer(restored, ruling.team, verdict, reversal);
  else if (restored.stage === 'bonus') next = bonusSolve(restored, verdict);
  return next === restored ? s : commit(restored, next, action);
}

export function wheelReduce(state: WheelState, action: WheelAction): WheelState {
  if (action.type === 'UNDO') {
    const top = state.history[state.history.length - 1];
    if (!top) return state;
    return emit(restoreFrom(state, top), 'undo');
  }
  if (action.type === 'HOST_SOLVE_OVERRIDE') return hostOverride(state, action.verdict, action);
  const next = dispatch(state, action);
  return next === state ? state : commit(state, next, action);
}

export { EVENT_LIMIT, HISTORY_LIMIT };
