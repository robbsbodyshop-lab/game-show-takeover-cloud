/**
 * The `data` of a `kind: 'wheel'` host snapshot (FR-013, design.md 5): everything the console needs,
 * including the hidden facts only the host may see (puzzle text, next puzzle, the sealed envelope, a
 * close answer waiting for a ruling). It travels only on the host topic, never to the audience (P-002).
 * `readWheelHostData` tolerates anything missing or malformed so a host view never crashes on a stage
 * that is a version behind (TD-008).
 */
import { z } from 'zod';
import { hostView } from '@/engines/wheel/selectors';
import type { PhoneControls } from '@/engines/wheel/selectors';
import type { WheelSettings, WheelState } from '@/engines/wheel/types';
import { DEFAULT_WHEEL_SETTINGS, wheelSettingsSchema } from './settings';

export type ClockKind = 'turn' | 'window' | 'frenzy' | 'bonus' | 'envelope';

/** A clock as the console shows it: `remainingMs` was true at `asOf` (epoch ms) and runs down if `running`. */
export interface ClockSnapshot {
  kind: ClockKind;
  label: string;
  totalMs: number;
  remainingMs: number;
  running: boolean;
  asOf: number;
}

export interface PendingRuling {
  team: number;
  answer: string;
  source: 'phone' | 'stage';
}

export interface WheelHostBuild {
  state: WheelState;
  phone: PhoneControls;
  clock: ClockSnapshot | null;
  pending: PendingRuling | null;
  nextSettings: WheelSettings;
  spinning: boolean;
  /** The team a command about the current moment must be stamped with (FR-017), or null. */
  acting: number | null;
}

const teamRow = z.object({
  id: z.number().int(),
  name: z.string().catch(''),
  bank: z.number().catch(0),
  roundCash: z.number().catch(0),
  wildCard: z.boolean().catch(false),
  millionWedge: z.enum(['none', 'round', 'kept']).catch('none'),
  prizes: z.array(z.string()).catch([]),
  roundPrizes: z.array(z.object({ name: z.string(), value: z.number() })).catch([]),
  lockedOut: z.boolean().catch(false),
});

const puzzleInfo = z.object({
  category: z.string().catch(''),
  phrase: z.string().catch(''),
  lines: z.array(z.string()).catch([]),
  theme: z.string().nullable().catch(null),
  prize: z.string().nullable().catch(null),
  sameLetter: z.string().nullable().catch(null),
});

const clockInfo = z.object({
  kind: z.enum(['turn', 'window', 'frenzy', 'bonus', 'envelope']).catch('turn'),
  label: z.string().catch(''),
  totalMs: z.number().catch(0),
  remainingMs: z.number().catch(0),
  running: z.boolean().catch(false),
  asOf: z.number().catch(0),
});

const phoneInfo = z.object({
  activeTeam: z.number().int().nullable().catch(null),
  canBuy: z.boolean().catch(false),
  canSpin: z.boolean().catch(false),
  canSolve: z.boolean().catch(false),
  turnName: z.string().catch(''),
  buzzTeams: z.array(z.number().int()).optional().catch(undefined),
  offLabel: z.string().optional().catch(undefined),
});

const schema = z.object({
  stage: z.string().catch(''),
  phase: z.string().catch(''),
  round: z.number().catch(0),
  headline: z.string().catch(''),
  turn: z.number().int().nullable().catch(null),
  acting: z.number().int().nullable().catch(null),
  puzzle: puzzleInfo.nullable().catch(null),
  nextPuzzle: z.object({ category: z.string(), phrase: z.string() }).nullable().catch(null),
  request: z.object({ use: z.string(), count: z.number() }).nullable().catch(null),
  legal: z.array(z.string()).catch([]),
  letters: z
    .object({
      call: z.array(z.string()).catch([]),
      buy: z.array(z.string()).catch([]),
      bonus: z.array(z.string()).catch([]),
    })
    .catch({ call: [], buy: [], bonus: [] }),
  teams: z.array(teamRow).catch([]),
  called: z.array(z.string()).catch([]),
  consonantsLeft: z.number().catch(0),
  vowelsLeft: z.number().catch(0),
  fullyRevealed: z.boolean().catch(false),
  envelope: z
    .object({ kind: z.enum(['cash', 'car']), value: z.number() })
    .nullable()
    .catch(null),
  bonus: z
    .object({
      team: z.number().int(),
      category: z.string().nullable(),
      categories: z.array(z.string()),
      picked: z.array(z.string()),
      consonantsLeft: z.number(),
      vowelsLeft: z.number(),
    })
    .nullable()
    .catch(null),
  canLateSolve: z.boolean().catch(false),
  canAcceptLateBonus: z.boolean().catch(false),
  reversible: z
    .object({ team: z.number().int().nullable(), verdict: z.enum(['correct', 'wrong']) })
    .nullable()
    .catch(null),
  pending: z
    .object({ team: z.number().int(), answer: z.string(), source: z.enum(['phone', 'stage']) })
    .nullable()
    .catch(null),
  bell: z.boolean().catch(false),
  canUndo: z.boolean().catch(false),
  spinning: z.boolean().catch(false),
  settings: wheelSettingsSchema.catch({ ...DEFAULT_WHEEL_SETTINGS }),
  nextSettings: wheelSettingsSchema.catch({ ...DEFAULT_WHEEL_SETTINGS }),
  clock: clockInfo.nullable().catch(null),
  phone: phoneInfo.catch({
    activeTeam: null,
    canBuy: false,
    canSpin: false,
    canSolve: false,
    turnName: '',
  }),
  gameOver: z.object({ winnerId: z.number().int(), points: z.number() }).nullable().catch(null),
});

export type WheelHostData = z.infer<typeof schema>;

export const EMPTY_WHEEL_HOST_DATA: WheelHostData = schema.parse({});

/** Never throws; anything that is not an object gives the empty data. */
export function readWheelHostData(raw: unknown): WheelHostData {
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : EMPTY_WHEEL_HOST_DATA;
}

const STAGE_TITLE: Record<string, string> = {
  tossup: 'Toss-up',
  frenzy: 'Fortune Frenzy',
  triple: 'Triple Toss-Up',
  tiebreak: 'Tiebreaker toss-up',
  speedup: 'Speed-Up',
  bonus: 'Bonus Round',
  'game-over': 'Game over',
};

const PHASE_ACTION: Record<string, string> = {
  'awaiting-puzzles': 'getting the next puzzle',
  'tossup-reveal': 'letters appearing, waiting for a buzz',
  'tossup-answer': 'answering',
  'tossup-done': 'toss-up finished',
  choose: 'to spin, buy a vowel or solve',
  'call-consonant': 'to call a consonant',
  'mystery-choice': 'to keep the money or flip the wedge',
  'express-choice': 'to ride the Express or pass',
  'express-run': 'on the Express: consonant, vowel or solve',
  solving: 'solving',
  'round-award': 'round over',
  'speedup-spin': 'to make the Speed-Up spin',
  'speedup-act': 'to call a letter or solve',
  'speedup-window': 'to solve (3 second window)',
  'bonus-category': 'to pick a category',
  'bonus-spin': 'to spin the Bonus Wheel',
  'bonus-letters': 'to call letters',
  'bonus-ready': 'ready for the 10 second clock',
  'bonus-solving': 'solving against the clock',
  'bonus-timeup': 'out of time',
  'bonus-won': 'solved, envelope still sealed',
  'bonus-opened': 'envelope open',
  done: 'finished',
};

/** One plain sentence for the top of the console: where the game is and whose move it is. */
export function describeState(state: WheelState): string {
  const title =
    state.stage === 'round' ? `Round ${String(state.round)}` : (STAGE_TITLE[state.stage] ?? state.stage);
  const who =
    state.stage === 'bonus'
      ? state.bonus?.team
      : state.phase === 'tossup-answer'
        ? state.tossup?.buzzed
        : state.turn;
  const name = state.teams.find((t) => t.id === who)?.name;
  const action = PHASE_ACTION[state.phase] ?? state.phase;
  return name ? `${title}: ${name} ${action}` : `${title}: ${action}`;
}

export function buildWheelHostData(build: WheelHostBuild): WheelHostData {
  const { state } = build;
  const hv = hostView(state);
  const b = state.bonus;
  return {
    stage: state.stage,
    phase: state.phase,
    round: state.round,
    headline: describeState(state),
    turn: state.turn,
    acting: build.acting,
    puzzle: hv.puzzle
      ? {
          category: hv.puzzle.category,
          phrase: hv.puzzle.phrase,
          lines: hv.puzzle.lines,
          theme: hv.puzzle.theme,
          prize: hv.puzzle.prize ? hv.puzzle.prize.name : null,
          sameLetter: hv.puzzle.sameLetter,
        }
      : null,
    nextPuzzle: hv.nextPuzzle ? { category: hv.nextPuzzle.category, phrase: hv.nextPuzzle.phrase } : null,
    request: hv.request ? { use: hv.request.use, count: hv.request.count } : null,
    legal: hv.legalActions,
    letters: hv.legalLetters,
    teams: hv.teams.map((t) => ({
      id: t.id,
      name: t.name,
      bank: t.bank,
      roundCash: t.roundCash,
      wildCard: t.wildCard,
      millionWedge: t.millionWedge,
      prizes: [...t.prizes],
      roundPrizes: t.roundPrizes.map((p) => ({ ...p })),
      lockedOut: t.lockedOut,
    })),
    called: state.puzzle ? [...state.puzzle.called] : [],
    consonantsLeft: hv.consonantsLeft,
    vowelsLeft: hv.vowelsLeft,
    fullyRevealed: hv.fullyRevealed,
    envelope: hv.envelope ? { kind: hv.envelope.kind, value: hv.envelope.value } : null,
    bonus: b
      ? {
          team: b.team,
          category: b.category,
          categories: [...new Set(b.options.map((p) => p.category))],
          picked: [...b.picked],
          consonantsLeft: hv.bonusLettersLeft?.consonants ?? 0,
          vowelsLeft: hv.bonusLettersLeft?.vowels ?? 0,
        }
      : null,
    canLateSolve: hv.canLateSolve,
    canAcceptLateBonus: hv.canAcceptLateBonus,
    reversible: hv.reversibleRuling,
    pending: build.pending,
    bell: hv.bell,
    canUndo: hv.canUndo,
    spinning: build.spinning,
    settings: { ...state.settings },
    nextSettings: { ...build.nextSettings },
    clock: build.clock,
    phone: build.phone,
    gameOver: state.outcome
      ? {
          winnerId: state.outcome.winnerId,
          points: Math.round((state.teams.find((t) => t.id === state.outcome?.winnerId)?.bank ?? 0) / 100),
        }
      : null,
  };
}
