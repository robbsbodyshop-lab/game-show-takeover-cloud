/**
 * Read-only views of the Wheel state. `audienceView` is the only thing stage components receive: it
 * carries no unrevealed puzzle letter and no sealed envelope. `hostView` is host-only (P-002).
 */
import { bonusRemaining } from './bonus';
import type { Envelope } from './bonus';
import { ALPHABET, VOWELS } from './letters';
import { isFullyRevealed, litCount } from './puzzleState';
import type { PuzzleState } from './puzzleState';
import type {
  Award,
  Phase,
  Prize,
  PuzzleInput,
  PuzzleRequest,
  Stage,
  TeamId,
  TeamState,
  WheelAction,
  WheelActionType,
  WheelEvent,
  WheelSettings,
  WheelState,
} from './types';
import { buildWheel } from './wheels';
import type { Wedge } from './wheels';
import { wheelReduce } from './wheelEngine';
import type { RoundNo } from './types';
import { topTeamId } from './bonusFlow';

export type AudienceCell =
  | { kind: 'blank' }
  | { kind: 'punct'; char: string }
  /** A letter tile: `char` is null until the tile is lit, so unrevealed letters never leave the engine. */
  | { kind: 'tile'; lit: boolean; char: string | null };

export interface AudienceTeam {
  id: TeamId;
  name: string;
  bank: number;
  roundCash: number;
  prizes: string[];
  roundPrizes: Prize[];
  wildCard: boolean;
  millionWedge: boolean;
  lockedOut: boolean;
}

export interface AudienceView {
  stage: Stage;
  phase: Phase;
  round: number;
  category: string | null;
  prizePuzzle: boolean;
  theme: string | null;
  board: AudienceCell[][] | null;
  called: string[];
  /** Tiles revealed by a call but not lit yet (the UI lights them one by one). */
  pendingLights: number;
  teams: AudienceTeam[];
  turn: TeamId | null;
  buzzed: TeamId | null;
  spin: { kind: string; value: number } | null;
  wheel: Wedge[] | null;
  speedUp: { value: number | null; window: boolean } | null;
  frenzy: { msLeft: number; started: boolean } | null;
  triple: { index: number; solvers: (TeamId | null)[] } | null;
  tossupValue: number | null;
  award: Award | null;
  bonus: {
    team: TeamId;
    categories: string[];
    category: string | null;
    picked: string[];
    won: boolean | null;
    opened: boolean;
    /** Only after the envelope is opened. */
    prize: Envelope | null;
  } | null;
  turnTimerSec: number;
  bell: boolean;
  winnerId: TeamId | null;
  events: WheelEvent[];
}

function audienceBoard(ps: PuzzleState | null): AudienceCell[][] | null {
  if (!ps) return null;
  let tile = 0;
  return ps.board.cells.map((row) =>
    row.map((cell): AudienceCell => {
      if (cell.kind === 'blank') return { kind: 'blank' };
      if (cell.kind === 'punct') return { kind: 'punct', char: cell.char };
      const lit = ps.shown[tile] === true;
      tile += 1;
      return { kind: 'tile', lit, char: lit ? cell.char : null };
    }),
  );
}

function currentWheel(s: WheelState): Wedge[] | null {
  if (s.stage === 'round' && s.round >= 1) return buildWheel(s.round as RoundNo, s.specials);
  if (s.stage === 'speedup') return buildWheel(4);
  return null;
}

export function audienceView(s: WheelState): AudienceView {
  const seg = s.plan[s.planIndex];
  const b = s.bonus;
  return {
    stage: s.stage,
    phase: s.phase,
    round: s.round,
    category: s.puzzle?.puzzle.category ?? null,
    prizePuzzle: s.stage === 'round' && seg?.kind === 'round' && seg.prize,
    theme: s.stage === 'triple' ? (s.puzzle?.puzzle.theme ?? null) : null,
    board: audienceBoard(s.puzzle),
    called: s.puzzle ? [...s.puzzle.called] : [],
    pendingLights: s.puzzle?.queue.length ?? 0,
    teams: s.teams.map((t) => ({
      id: t.id,
      name: t.name,
      bank: t.bank,
      roundCash: t.roundCash,
      prizes: [...t.prizes],
      roundPrizes: t.roundPrizes.map((p) => ({ ...p })),
      wildCard: t.wildCard,
      millionWedge: t.millionWedge !== 'none',
      lockedOut: t.lockedOut,
    })),
    turn: s.turn,
    buzzed: s.tossup?.buzzed ?? null,
    spin: s.spin ? { kind: s.spin.kind, value: s.spin.value } : null,
    wheel: currentWheel(s),
    speedUp: s.speedUp ? { value: s.speedUp.value, window: s.phase === 'speedup-window' } : null,
    frenzy: s.frenzy ? { msLeft: s.frenzy.msLeft, started: s.frenzy.started } : null,
    triple: s.triple ? { index: s.triple.index, solvers: [...s.triple.solvers] } : null,
    tossupValue: s.tossup?.value ?? null,
    award: s.award,
    bonus: b
      ? {
          team: b.team,
          categories: [...new Set(b.options.map((p) => p.category))],
          category: b.category,
          picked: [...b.picked],
          won:
            s.phase === 'bonus-won' || s.phase === 'bonus-opened' || s.phase === 'bonus-timeup'
              ? b.won
              : null,
          opened: b.opened,
          prize: b.opened ? b.envelope : null,
        }
      : null,
    turnTimerSec: s.settings.turnTimerSec,
    bell: s.bell,
    winnerId: s.outcome?.winnerId ?? null,
    events: s.events,
  };
}

const ACTION_TYPES: readonly WheelActionType[] = [
  'SPIN',
  'CALL_LETTER',
  'BUY_VOWEL',
  'SOLVE_START',
  'SOLVE',
  'SOLVE_CANCEL',
  'BUZZ',
  'TOSSUP_REVEAL_NEXT',
  'TOSSUP_ANSWER',
  'FRENZY_TICK',
  'PLAY_WILD_CARD',
  'MYSTERY',
  'EXPRESS',
  'RING_BELL',
  'SPEEDUP_SPIN',
  'TIME_OUT',
  'LATE_SOLVE',
  'HOST_SOLVE_OVERRIDE',
  'SKIP_TURN',
  'SET_TURN',
  'THROW_OUT_PUZZLE',
  'END_ROUND_UNSOLVED',
  'ADJUST_BANK',
  'SET_TURN_TIMER',
  'PROVIDE_PUZZLES',
  'BONUS_PICK_CATEGORY',
  'BONUS_SPIN',
  'BONUS_CALL_LETTER',
  'BONUS_SOLVE',
  'BONUS_TIME_UP',
  'BONUS_ACCEPT_LATE',
  'BONUS_OPEN_ENVELOPE',
  'CONTINUE',
  'UNDO',
  'LIGHT_NEXT',
  'LIGHT_ALL',
];

const PROBE_PUZZLE: PuzzleInput = { id: '__probe__', category: 'PROBE', phrase: 'A', use: [] };

/** Representative actions of each type; legality is decided by the engine itself so it cannot drift. */
function probes(s: WheelState, type: WheelActionType): WheelAction[] {
  const teams = s.teams.map((t) => t.id);
  const first = teams[0] ?? 0;
  switch (type) {
    case 'SPIN':
    case 'SPEEDUP_SPIN':
    case 'BONUS_SPIN':
    case 'TOSSUP_REVEAL_NEXT':
      return [{ type, draw: 0.51 }];
    case 'CALL_LETTER':
    case 'BUY_VOWEL':
    case 'BONUS_CALL_LETTER':
      return ALPHABET.map((letter) => ({ type, letter }));
    case 'SOLVE':
    case 'HOST_SOLVE_OVERRIDE':
    case 'BONUS_SOLVE':
      return [
        { type, verdict: 'correct' },
        { type, verdict: 'wrong' },
      ];
    case 'BUZZ':
      return teams.map((team) => ({ type, team, at: 0 }));
    case 'TOSSUP_ANSWER':
      return teams.flatMap((team) => [
        { type, team, verdict: 'correct' as const },
        { type, team, verdict: 'wrong' as const },
      ]);
    case 'FRENZY_TICK':
      return [{ type, ms: 1 }];
    case 'MYSTERY':
      return [
        { type, choice: 'keep' },
        { type, choice: 'flip', draw: 0.1 },
      ];
    case 'EXPRESS':
      return [
        { type, choice: 'play' },
        { type, choice: 'pass' },
      ];
    case 'TIME_OUT':
    case 'SET_TURN':
      return teams.map((team) => ({ type, team }));
    case 'ADJUST_BANK':
      return [{ type, team: first, delta: 1000 }];
    case 'SET_TURN_TIMER':
      return [{ type, sec: s.settings.turnTimerSec === 10 ? 5 : 10 }];
    case 'PROVIDE_PUZZLES':
      return [{ type, puzzles: [PROBE_PUZZLE] }];
    case 'BONUS_PICK_CATEGORY':
      return (s.bonus?.options ?? []).map((p) => ({ type, category: p.category }));
    default:
      return [{ type }];
  }
}

function legalFor(s: WheelState, type: WheelActionType): WheelAction[] {
  return probes(s, type).filter((a) => wheelReduce(s, a) !== s);
}

/** The action types the engine would accept right now. */
export function legalActions(s: WheelState): WheelActionType[] {
  return ACTION_TYPES.filter((t) => legalFor(s, t).length > 0);
}

export interface LegalLetters {
  /** Letters CALL_LETTER accepts now (a letter already called is accepted: it records a repeat). */
  call: string[];
  buy: string[];
  bonus: string[];
}

export function legalLetters(s: WheelState): LegalLetters {
  const letters = (type: WheelActionType): string[] =>
    legalFor(s, type).flatMap((a) => ('letter' in a ? [a.letter] : []));
  return { call: letters('CALL_LETTER'), buy: letters('BUY_VOWEL'), bonus: letters('BONUS_CALL_LETTER') };
}

export const lockedOut = (s: WheelState, team: TeamId): boolean =>
  s.teams.find((t) => t.id === team)?.lockedOut ?? false;

/** SOLVE within 1.5 s of a decision-clock time-out gives the solve back (the controller times it). */
export function canLateSolve(s: WheelState): boolean {
  return s.timedOut !== null && wheelReduce(s, { type: 'LATE_SOLVE' }) !== s;
}

/** Bonus: "Accept: the answer started before the buzzer", until the envelope opens. */
export function canAcceptLateBonus(s: WheelState): boolean {
  return s.stage === 'bonus' && s.phase === 'bonus-timeup' && s.bonus?.opened === false;
}

export interface PhoneControls {
  activeTeam: TeamId | null;
  canBuy: boolean;
  canSpin: boolean;
  canSolve: boolean;
  turnName: string;
  /** Toss-ups: the teams whose BUZZ is accepted right now. */
  buzzTeams?: TeamId[];
  /** Why the controls are off, shown on the phone. */
  offLabel?: string;
}

const OFF_LABELS: Partial<Record<Phase, string>> = {
  'awaiting-puzzles': 'GETTING THE PUZZLE READY',
  'call-consonant': 'CALL A CONSONANT',
  'mystery-choice': 'KEEP THE MONEY OR FLIP IT',
  'express-choice': 'RIDE THE EXPRESS OR PASS',
  'express-run': 'CALL A CONSONANT',
  solving: 'SOLVING',
  'round-award': 'ROUND OVER',
  'tossup-done': 'TOSS-UP OVER',
  'speedup-window': 'SOLVE NOW',
  'speedup-act': 'CALL A LETTER OR SOLVE',
  'bonus-category': 'PICK A CATEGORY',
  'bonus-letters': 'CALL YOUR LETTERS',
  'bonus-solving': 'SOLVE',
};

export function phoneControls(s: WheelState): PhoneControls {
  const teamName = (id: TeamId | null): string => s.teams.find((t) => t.id === id)?.name ?? '';
  const can = (type: WheelActionType): boolean => legalFor(s, type).length > 0;

  if (
    s.phase !== 'awaiting-puzzles' &&
    (s.stage === 'tossup' || s.stage === 'frenzy' || s.stage === 'triple' || s.stage === 'tiebreak')
  ) {
    const ready = s.phase === 'tossup-reveal' && s.puzzle !== null && litCount(s.puzzle) > 0;
    const buzz = ready
      ? s.teams.filter((t) => wheelReduce(s, { type: 'BUZZ', team: t.id, at: 0 }) !== s).map((t) => t.id)
      : [];
    return {
      activeTeam: null,
      canBuy: false,
      canSpin: false,
      canSolve: false,
      turnName: s.phase === 'tossup-answer' ? teamName(s.tossup?.buzzed ?? null) : '',
      buzzTeams: buzz,
      ...(ready
        ? {}
        : { offLabel: s.phase === 'tossup-reveal' ? 'WAIT FOR A LETTER' : (OFF_LABELS[s.phase] ?? '') }),
    };
  }

  const active = s.stage === 'bonus' ? (s.bonus?.team ?? null) : s.turn;
  const controls: PhoneControls = {
    activeTeam: active,
    canBuy: can('BUY_VOWEL'),
    canSpin: can('SPIN') || can('SPEEDUP_SPIN') || can('BONUS_SPIN'),
    canSolve: can('SOLVE_START'),
    turnName: teamName(active),
  };
  if (!controls.canBuy && !controls.canSpin && !controls.canSolve) {
    const label = OFF_LABELS[s.phase];
    if (label) controls.offLabel = label;
  }
  return controls;
}

export interface HostView {
  stage: Stage;
  phase: Phase;
  round: number;
  puzzle: {
    id: string;
    category: string;
    phrase: string;
    lines: string[];
    theme: string | null;
    prize: Prize | null;
    sameLetter: string | null;
  } | null;
  nextPuzzle: PuzzleInput | null;
  /** What the engine is waiting for the UI to provide. */
  request: PuzzleRequest | null;
  legalActions: WheelActionType[];
  legalLetters: LegalLetters;
  teams: TeamState[];
  turn: TeamId | null;
  consonantsLeft: number;
  vowelsLeft: number;
  fullyRevealed: boolean;
  /** Bonus Round secrets. */
  envelope: Envelope | null;
  bonusLettersLeft: { consonants: number; vowels: number } | null;
  canLateSolve: boolean;
  canAcceptLateBonus: boolean;
  /** The last ruling that can still be reversed with HOST_SOLVE_OVERRIDE. */
  reversibleRuling: { team: TeamId | null; verdict: 'correct' | 'wrong' } | null;
  bell: boolean;
  settings: WheelSettings;
  canUndo: boolean;
}

export function hostView(s: WheelState): HostView {
  const ps = s.puzzle;
  const ruling = s.lastRuling;
  const reversibleRuling =
    ruling !== null && ruling.step === s.step && s.history.length > 0
      ? { team: ruling.team, verdict: ruling.verdict }
      : null;
  return {
    stage: s.stage,
    phase: s.phase,
    round: s.round,
    puzzle: ps
      ? {
          id: ps.puzzle.id,
          category: ps.puzzle.category,
          phrase: ps.puzzle.phrase,
          lines: [...ps.board.lines],
          theme: ps.puzzle.theme ?? null,
          prize: ps.puzzle.prize ?? null,
          sameLetter: ps.puzzle.sameLetter ?? null,
        }
      : null,
    nextPuzzle: s.queue[0] ?? null,
    request: s.request,
    legalActions: legalActions(s),
    legalLetters: legalLetters(s),
    teams: s.teams,
    turn: s.turn,
    consonantsLeft: ps
      ? ALPHABET.filter(
          (l) => !VOWELS.includes(l) && ps.tiles.some((t) => t.char === l) && !ps.called.includes(l),
        ).length
      : 0,
    vowelsLeft: ps
      ? VOWELS.filter((l) => ps.tiles.some((t) => t.char === l) && !ps.called.includes(l)).length
      : 0,
    fullyRevealed: ps ? isFullyRevealed(ps) : false,
    envelope: s.bonus?.envelope ?? null,
    bonusLettersLeft: s.bonus?.envelope ? bonusRemaining(s.bonus.picked, s.bonus.hasWildCard) : null,
    canLateSolve: canLateSolve(s),
    canAcceptLateBonus: canAcceptLateBonus(s),
    reversibleRuling,
    bell: s.bell,
    settings: s.settings,
    canUndo: s.history.length > 0,
  };
}

export interface GameResult {
  winnerId: TeamId;
  /** The winner's points: main-game total / $100, rounded. The Bonus prize is not included. */
  score: number;
  /** Every other team's points, keyed by team id. */
  extraScores: Record<TeamId, number>;
  /** A bonus Plinko chip for winning the Bonus Round. */
  bonusChips: number;
}

/** Null until the game is over. $100 of Wheel money is 1 point (rules, "How it maps to the event"). */
export function gameResult(s: WheelState): GameResult | null {
  if (s.stage !== 'game-over') return null;
  const winnerId = s.outcome?.winnerId ?? topTeamId(s);
  const points = (t: TeamState): number => Math.round(t.bank / 100);
  const extraScores: Record<TeamId, number> = {};
  let score = 0;
  for (const t of s.teams) {
    if (t.id === winnerId) score = points(t);
    else extraScores[t.id] = points(t);
  }
  return { winnerId, score, extraScores, bonusChips: s.bonus?.won === true ? 1 : 0 };
}
