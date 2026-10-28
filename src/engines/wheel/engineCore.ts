/**
 * Shared helpers for the Wheel engine: events, team lookups, puzzle queue, turn bookkeeping.
 * Rules: docs/WHEEL_OF_FORTUNE_RULES.md.
 */
import { consonantsRemaining, createPuzzleState, vowelsRemaining } from './puzzleState';
import type {
  Phase,
  Prize,
  PuzzleInput,
  PuzzleRequest,
  Snapshot,
  TeamId,
  TeamState,
  WheelEvent,
  WheelState,
} from './types';

export const VOWEL_PRICE = 250;
export const HOUSE_MINIMUM = 1000;
export const SPEEDUP_BONUS = 1000;
export const HISTORY_LIMIT = 30;
export const EVENT_LIMIT = 80;
/** A letter call this soon after play passed (both with `at`) is dropped (FR-044). */
export const DROP_WINDOW_MS = 500;

export type EventData = Omit<WheelEvent, 'seq' | 'type'>;

export function emit(s: WheelState, type: WheelEvent['type'], data: EventData = {}): WheelState {
  const seq = s.eventSeq + 1;
  return { ...s, eventSeq: seq, events: [...s.events, { seq, type, ...data }].slice(-EVENT_LIMIT) };
}

export function teamById(s: WheelState, id: TeamId | null): TeamState | undefined {
  return id === null ? undefined : s.teams.find((t) => t.id === id);
}

export function mapTeam(s: WheelState, id: TeamId, fn: (t: TeamState) => TeamState): WheelState {
  return { ...s, teams: s.teams.map((t) => (t.id === id ? fn(t) : t)) };
}

export function mapTeams(s: WheelState, fn: (t: TeamState) => TeamState): WheelState {
  return { ...s, teams: s.teams.map(fn) };
}

export function nextTeamId(s: WheelState, id: TeamId): TeamId {
  const i = s.teams.findIndex((t) => t.id === id);
  const next = s.teams[(i + 1) % s.teams.length];
  return (next ?? s.teams[0])?.id ?? id;
}

export function firstTeamId(s: WheelState): TeamId {
  return s.teams[0]?.id ?? 0;
}

export const isRoundLike = (s: WheelState): boolean => s.stage === 'round' || s.stage === 'speedup';
export const isTossupLike = (s: WheelState): boolean =>
  s.stage === 'tossup' || s.stage === 'frenzy' || s.stage === 'triple' || s.stage === 'tiebreak';

export const prizeTotal = (prizes: readonly Prize[]): number => prizes.reduce((n, p) => n + p.value, 0);

export function snapshotOf(s: WheelState): Snapshot {
  const copy: Partial<WheelState> = { ...s };
  delete copy.history;
  delete copy.events;
  return copy as Snapshot;
}

/** Applies Bankrupt to a team: round cash, round prizes, Wild Card and Million Dollar Wedge are lost. */
export function bankrupt(s: WheelState, id: TeamId): WheelState {
  const next = mapTeam(s, id, (t) => ({
    ...t,
    roundCash: 0,
    roundPrizes: [],
    wildCard: false,
    millionWedge: 'none',
  }));
  return emit(next, 'bankrupt', { team: id });
}

/** Nothing left to spin for: no consonant (or, in the Speed-Up, no letter at all). */
export function isDry(s: WheelState): boolean {
  if (!s.puzzle) return false;
  if (s.stage === 'speedup') return consonantsRemaining(s.puzzle) === 0 && vowelsRemaining(s.puzzle) === 0;
  return consonantsRemaining(s.puzzle) === 0;
}

export function anyoneCanBuy(s: WheelState): boolean {
  if (!s.puzzle || vowelsRemaining(s.puzzle) === 0) return false;
  return s.teams.some((t) => t.roundCash >= VOWEL_PRICE);
}

/** Puts the first queued puzzle in play. Returns null when the queue has nothing playable. */
export function installNextPuzzle(s: WheelState): WheelState | null {
  let queue = s.queue;
  while (queue.length > 0) {
    const [head, ...rest] = queue;
    queue = rest;
    if (!head) break;
    const puzzle = createPuzzleState(head);
    if (puzzle) {
      return emit(
        { ...s, puzzle, queue, seen: s.seen.includes(head.id) ? s.seen : [...s.seen, head.id] },
        'puzzle',
        { label: head.id },
      );
    }
  }
  return null;
}

/** Ask the UI for puzzles and wait: `awaiting` says what to do when they arrive. */
export function requestPuzzles(
  s: WheelState,
  request: PuzzleRequest,
  awaiting: 'start' | 'replace',
  resumePhase: Phase | null,
): WheelState {
  return { ...s, request, awaiting, resumePhase, phase: 'awaiting-puzzles' };
}

export function playableInputs(puzzles: readonly PuzzleInput[]): PuzzleInput[] {
  return puzzles.filter((p) => createPuzzleState(p) !== null);
}

/** The request that gets a replacement for the puzzle in play (same pool, same category where it matters). */
export function replacementRequest(s: WheelState): PuzzleRequest {
  const category = s.puzzle?.puzzle.category;
  switch (s.stage) {
    case 'frenzy':
      return { use: 'tossup', count: 1, ...(category ? { category } : {}) };
    case 'triple': {
      const set = s.puzzle?.puzzle.set;
      return { use: 'triple', count: 1, ...(category ? { category } : {}), ...(set ? { set } : {}) };
    }
    case 'tiebreak':
      return { use: 'tiebreak', count: 1 };
    case 'tossup':
      return { use: 'tossup', count: 1 };
    case 'round':
      return { use: s.plan[s.planIndex]?.kind === 'round' && s.round === 3 ? 'prize' : 'round', count: 1 };
    case 'bonus':
      return { use: 'bonus', count: 1, ...(s.bonus?.category ? { category: s.bonus.category } : {}) };
    default:
      return { use: 'round', count: 1 };
  }
}

/** Phase a round-like or toss-up stage returns to when a fresh puzzle is in play. */
export function phaseForFreshPuzzle(s: WheelState): Phase {
  if (isTossupLike(s)) return 'tossup-reveal';
  if (s.stage === 'speedup') return s.speedUp?.value == null ? 'speedup-spin' : 'speedup-act';
  return 'choose';
}

/**
 * Settles state around a newly installed puzzle: toss-up lockouts and buzz cleared, a round's
 * turn kept but its spin and solve context dropped (money stays, called letters do not).
 */
export function resetForNewPuzzle(s: WheelState): WheelState {
  let n: WheelState = { ...s, request: null, awaiting: null, resumePhase: null };
  if (isTossupLike(n)) {
    n = mapTeams(n, (t) => (t.lockedOut ? { ...t, lockedOut: false } : t));
    return {
      ...n,
      phase: 'tossup-reveal',
      tossup: n.tossup ? { ...n.tossup, buzzed: null, buzzedAt: null, solver: null } : n.tossup,
    };
  }
  n = { ...n, spin: null, lastConsonant: null, solve: null, dryFails: 0 };
  n = { ...n, turnDry: isDry(n) };
  return { ...n, phase: phaseForFreshPuzzle(n) };
}

/**
 * Throws the puzzle in play out: the next queued puzzle comes up at once, otherwise the engine asks
 * for one. Turn and money stay (rules, "Solving" and the host tools).
 */
export function throwOutPuzzle(s: WheelState): WheelState {
  let n = emit(s, 'puzzle-thrown-out');
  const installed = installNextPuzzle(n);
  if (installed) return resetForNewPuzzle(installed);
  n = requestPuzzles(n, replacementRequest(n), 'replace', phaseForFreshPuzzle(n));
  return n;
}
