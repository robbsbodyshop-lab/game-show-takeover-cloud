/**
 * The Wheel controller (design.md section 7, conventions "Controllers"): a framework-free class that
 * owns the engine state and the game revision, runs every timed sequence (letter lighting, toss-up
 * reveals, the Frenzy, turn, Speed-Up and Bonus clocks, the envelope suspense, the spin), plays the
 * cues, answers phones and host commands, and exposes an immutable snapshot to React through
 * `useSyncExternalStore`. The engine decides every rule (P-003/P-004); this class only schedules,
 * judges typed answers and translates intents into engine actions.
 *
 * Rules of record: docs/WHEEL_OF_FORTUNE_RULES.md. Hidden information (puzzle text, the sealed
 * envelope, a close answer waiting for a ruling) leaves this class only through the host snapshot.
 */
import type { SoundName } from '@/audio/cues';
import type { AudioPlayer } from '@/audio/player';
import type { Rng, WheelPuzzle } from '@/content';
import { judgeSolve } from '@/engines/wheel/solve';
import { hiddenTileIndices } from '@/engines/wheel/puzzleState';
import { parseLetter, isVowel } from '@/engines/wheel/letters';
import { isRoundLike, isTossupLike } from '@/engines/wheel/engineCore';
import {
  audienceView,
  canLateSolve,
  gameResult,
  legalActions,
  legalLetters,
  phoneControls,
} from '@/engines/wheel/selectors';
import type { AudienceView, GameResult, LegalLetters } from '@/engines/wheel/selectors';
import type {
  TeamId,
  WheelAction,
  WheelActionType,
  WheelEvent,
  WheelSettings,
  WheelState,
} from '@/engines/wheel/types';
import { createWheelState, wheelReduce } from '@/engines/wheel/wheelEngine';
import { logger } from '@/lib/logger';
import { IDLE_PHONE_CONTROLS } from '@/stage/gameContract';
import type { GameEndReport, PhoneBridge, PhoneControls } from '@/stage/gameContract';
import type { CommandResult, HostBridge, HostCommand } from '@/host/hostProtocol';
import { COMMAND_REPEAT_WINDOW_MS } from '@/host/hostProtocol';
import { cuesFor, vowelNoticeCue } from './cues';
import type { CuePlay } from './cues';
import { buildWheelHostData } from './hostData';
import type { ClockSnapshot, PendingRuling } from './hostData';
import { PausableTimers, realTimers } from './pausableTimers';
import type { TimerEnv } from './pausableTimers';
import { providePuzzles } from './puzzleProvider';
import { continueLabel, vowelNotice } from './presentation';
import { parseSavedWheelState } from './savedState';
import { parseWheelSettings } from './settings';
import { angleAtFrame, planSpin } from './spinPlan';
import type { SpinKind, SpinPlan } from './spinPlan';

// --- constants (HOST_FEATURE_INVENTORY.md 5.3, AUDIO_CUES_V1.md) --------------------------------------

/** Same ruling, letter, podium decision or tool twice within this window counts once (FR-017, FR-044). */
export const HOST_REPEAT_MS = COMMAND_REPEAT_WINDOW_MS;
/** SOLVE this soon after a decision clock ran out gives the solve back (FR-044). */
export const LATE_SOLVE_GRACE_MS = 1500;
export const LIGHT_INTERVAL_MS = 450;
export const TOSSUP_REVEAL_MS = 900;
export const FRENZY_TICK_MS = 250;
export const SPEEDUP_WINDOW_MS = 3000;
export const BONUS_CLOCK_MS = 10_000;
export const ENVELOPE_SUSPENSE_MS = 3000;
export const PLATE_MS = 2200;
export const FLASH_MS = 900;
/** The host window repeats `hello` every 2 s; the memory of handled command ids outlives a retry. */
const CMD_MEMORY_MS = 60_000;

const TURN_PHASES: readonly string[] = [
  'choose',
  'call-consonant',
  'mystery-choice',
  'express-choice',
  'express-run',
  'speedup-act',
];

/** Actions that change only what is shown or how fast: they never make a host command stale. */
const PRESENTATION: readonly WheelActionType[] = [
  'LIGHT_NEXT',
  'LIGHT_ALL',
  'TOSSUP_REVEAL_NEXT',
  'FRENZY_TICK',
  'SET_TURN_TIMER',
];

const SPIN_ACTIONS: readonly WheelActionType[] = ['SPIN', 'SPEEDUP_SPIN', 'BONUS_SPIN'];

/** Commands that must be stamped with the acting team to be accepted (FR-017). */
const TEAM_STAMPED: readonly string[] = [
  'spin',
  'letter',
  'call-letter',
  'buy-vowel',
  'solve-start',
  'solve-cancel',
  'solve',
  'rule',
  'accept-pending',
  'reject-pending',
  'mystery',
  'express',
  'play-wild-card',
  'skip-turn',
];

export interface ControllerTeam {
  id: TeamId;
  name: string;
  color?: string;
}

export type WheelAudio = Pick<
  AudioPlayer,
  'play' | 'loop' | 'stopLoop' | 'bed' | 'stop' | 'stopAll' | 'pauseAll' | 'resumeAll'
>;

export interface WheelControllerOptions {
  /** Teams in play order (door order when drawn, else team order). */
  teams: readonly ControllerTeam[];
  settings?: Partial<WheelSettings>;
  /** A saved engine state (FR-005); anything that is not a Wheel state is ignored. */
  initialState?: unknown;
  rng?: Rng;
  /** Content to draw from; defaults to the bundled file. */
  puzzles?: readonly WheelPuzzle[];
  usedContentIds?: readonly string[];
  audio: WheelAudio;
  phones: PhoneBridge;
  host: HostBridge;
  timers?: TimerEnv;
  inputLocked?: boolean;
  /** Let host commands through while locked (a stage that locks for the F2 drawer needs this). */
  allowHostWhileLocked?: boolean;
  reducedMotion?: boolean;
  onStateChange?: (state: unknown) => void;
  onGameEnd?: (report: GameEndReport) => void;
  onContentUsed?: (ids: string[]) => void;
  /** The "next game" form was saved (opening, Speed-Up start, length, Bonus Round, turn timer). */
  onSettingsSave?: (settings: WheelSettings) => void;
}

/** The callbacks a React wrapper may swap on every render without rebuilding the controller. */
export type WheelHandlers = Pick<
  WheelControllerOptions,
  'onStateChange' | 'onGameEnd' | 'onContentUsed' | 'onSettingsSave'
>;

export type PlateKind = 'bankrupt' | 'lose-turn' | 'wild-card' | 'million' | 'mystery-win';

export interface PlateUi {
  kind: PlateKind;
  team: TeamId | null;
}

export interface WheelUiSnapshot {
  /** The game revision commands are stamped with. */
  rev: number;
  view: AudienceView;
  teamColors: Readonly<Record<number, string>>;
  inputLocked: boolean;
  menuOpen: boolean;
  /** The wheel is turning: the result is held back from the view until it stops. */
  spinning: boolean;
  spinKind: SpinKind | null;
  /** Current rotation of the round wheel and of the Bonus Wheel, degrees. */
  wheelDeg: number;
  bonusDeg: number;
  legal: readonly WheelActionType[];
  letters: LegalLetters;
  /** The team a command about this moment is stamped with. */
  actingTeam: TeamId | null;
  canLateSolve: boolean;
  vowelPickTeam: TeamId | null;
  /** A close answer is waiting for the host's ruling (the text is never in this snapshot). */
  judging: { team: TeamId; source: 'phone' | 'stage' } | null;
  plate: PlateUi | null;
  flash: 'good' | 'bad' | null;
  clock: ClockSnapshot | null;
  envelopeOpening: boolean;
  result: GameResult | null;
  phone: PhoneControls;
  nextSettings: WheelSettings;
  /** What the keep-going button says right now, or null when it has nothing to do. */
  continueLabel: string | null;
  /** "NO MORE VOWELS" / "ONLY VOWELS REMAIN". */
  notice: string | null;
  /** The team whose Wild Card consonant call is in play. */
  wildCardPlaying: TeamId | null;
  /** Money earned on the wedge in play so far (what a Mystery flip gives up). */
  spinEarned: number;
}

type Listener = () => void;

interface SpinRun {
  plan: SpinPlan;
  /** `activeNow()` when the spin started. */
  startedAt: number;
  lastFrame: number;
}

const argString = (args: Record<string, unknown> | undefined, key: string): string | undefined => {
  const v = args?.[key];
  return typeof v === 'string' ? v : undefined;
};

const argNumber = (args: Record<string, unknown> | undefined, key: string): number | undefined => {
  const v = args?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
};

const ok: CommandResult = { applied: true };
const no = (reason: string): CommandResult => ({ applied: false, reason });

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
      .join(',')}}`;
  }
  const text = JSON.stringify(value) as string | undefined;
  return text ?? 'null';
}

export class WheelController {
  // --- engine ----------------------------------------------------------------------------------------
  private state: WheelState;
  /** What the audience sees: the state before a spin until the wheel stops. */
  private display: WheelState;
  private rev = 0;
  private lastSeq: number;
  private readonly provided = new Set<string>();
  private readonly reportedSeen = new Set<string>();
  /** The request no content could satisfy; asked again only when the engine asks for something else. */
  private starvedFor: unknown = null;

  // --- collaborators ---------------------------------------------------------------------------------
  private readonly rng: Rng;
  private readonly env: TimerEnv;
  private readonly timers: PausableTimers;
  private readonly audio: WheelAudio;
  private readonly teamColors: Record<number, string> = {};

  // --- lifecycle -------------------------------------------------------------------------------------
  private started = false;
  private disposed = false;
  private unsubscribers: (() => void)[] = [];
  private readonly listeners = new Set<Listener>();
  private snapshot: WheelUiSnapshot;
  private depth = 0;
  private dirty = false;
  private stateDirty = false;
  private hostDirty = true;
  private gameReported = false;

  // --- locking ---------------------------------------------------------------------------------------
  private externalLock: boolean;
  private menuOpen = false;
  private pausedAt: number | null = null;
  private pausedMs = 0;

  // --- presentation state ----------------------------------------------------------------------------
  private spin: SpinRun | null = null;
  private heldEvents: WheelEvent[] = [];
  private wheelDeg = 0;
  private bonusDeg = 0;
  private reducedMotion: boolean;
  private vowelPick: TeamId | null = null;
  private pending: PendingRuling | null = null;
  private plate: PlateUi | null = null;
  private flash: 'good' | 'bad' | null = null;
  private envelopeOpening = false;
  private wildCardPlaying: TeamId | null = null;
  private nextSettings: WheelSettings;

  // --- timer bookkeeping -----------------------------------------------------------------------------
  private turnKey: string | null = null;
  private tossupBed = false;
  private expressBed = false;
  private frenzyOn = false;
  private frenzyAnchor = 0;
  private bonusOn = false;
  private cueSeq = 0;
  private lastTimeOut: { team: TeamId; at: number } | null = null;

  // --- command memory --------------------------------------------------------------------------------
  private handlers: WheelHandlers;
  private readonly seenCmd = new Map<string, { at: number; result: CommandResult }>();
  private readonly recent = new Map<string, number>();

  constructor(private readonly options: WheelControllerOptions) {
    this.handlers = {
      ...(options.onStateChange ? { onStateChange: options.onStateChange } : {}),
      ...(options.onGameEnd ? { onGameEnd: options.onGameEnd } : {}),
      ...(options.onContentUsed ? { onContentUsed: options.onContentUsed } : {}),
      ...(options.onSettingsSave ? { onSettingsSave: options.onSettingsSave } : {}),
    };
    this.rng = options.rng ?? Math.random;
    this.env = options.timers ?? realTimers;
    this.timers = new PausableTimers(this.env);
    this.audio = options.audio;
    for (const t of options.teams) if (t.color) this.teamColors[t.id] = t.color;
    this.externalLock = options.inputLocked === true;
    this.reducedMotion = options.reducedMotion === true;
    if (this.externalLock) this.freeze();

    const saved = parseSavedWheelState(options.initialState);
    const settings = parseWheelSettings({ ...options.settings });
    this.state =
      saved ?? createWheelState({ teams: options.teams.map((t) => ({ id: t.id, name: t.name })), settings });
    this.display = this.state;
    this.lastSeq = this.state.eventSeq;
    this.nextSettings = options.settings ? { ...settings } : { ...(saved ? saved.settings : settings) };
    for (const id of options.usedContentIds ?? []) this.provided.add(id);
    for (const id of this.state.seen) {
      this.provided.add(id);
      this.reportedSeen.add(id);
    }
    for (const p of this.state.queue) this.provided.add(p.id);
    this.snapshot = this.buildSnapshot();
  }

  // --- React hook surface ----------------------------------------------------------------------------

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): WheelUiSnapshot => this.snapshot;

  /** For tests and persistence only: the full engine state holds secrets, never pass it to the stage. */
  getEngineState(): WheelState {
    return this.state;
  }

  /** Replaces the callbacks (a wrapper passes its latest props here after every render). */
  setHandlers(handlers: WheelHandlers): void {
    this.handlers = handlers;
  }

  getRev(): number {
    return this.rev;
  }

  // --- lifecycle -------------------------------------------------------------------------------------

  /** Attaches to the phone and host bridges and settles whatever the engine is waiting for. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.disposed = false;
    const { phones, host } = this.options;
    this.unsubscribers = [
      phones.onPress((press) => {
        this.handlePress(press.team, press.pressId, press.at);
      }),
      phones.onAction((message) => {
        this.handlePhoneAction(message.team, message.pressId, message.action, message.answer);
      }),
      host.onCommand('wheel', (command) => this.handleHostCommand(command)),
    ];
    this.batch(() => {
      this.dirty = true;
      this.hostDirty = true;
      this.rebeginEffects();
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.started = false;
    for (const off of this.unsubscribers) off();
    this.unsubscribers = [];
    this.timers.cancelAll();
    this.spin = null;
    this.audio.stopAll();
    this.tossupBed = false;
    this.expressBed = false;
    this.frenzyOn = false;
    this.bonusOn = false;
    this.turnKey = null;
  }

  /** F8 or an open dialog: freezes every clock, cue and spin; the same unlock resumes them. */
  setInputLocked(locked: boolean): void {
    if (this.externalLock === locked) return;
    this.externalLock = locked;
    this.syncLock();
  }

  /** The Wheel's own pause menu is a dialog too: it holds everything while open. */
  setMenuOpen(open: boolean): void {
    if (this.menuOpen === open) return;
    this.menuOpen = open;
    this.syncLock();
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  private get locked(): boolean {
    return this.externalLock || this.menuOpen;
  }

  private syncLock(): void {
    this.batch(() => {
      if (this.locked) this.freeze();
      else this.thaw();
      this.hostDirty = true;
      this.dirty = true;
    });
  }

  private freeze(): void {
    if (this.pausedAt !== null) return;
    this.pausedAt = this.env.now();
    this.timers.pause();
    this.audio.pauseAll();
  }

  private thaw(): void {
    if (this.pausedAt === null) return;
    this.pausedMs += this.env.now() - this.pausedAt;
    this.pausedAt = null;
    this.timers.resume();
    this.audio.resumeAll();
  }

  /** Wall time minus time spent paused: elapsed-time maths never counts a pause. */
  private activeNow(): number {
    const now = this.env.now();
    return now - this.pausedMs - (this.pausedAt === null ? 0 : now - this.pausedAt);
  }

  // --- the dispatch core -----------------------------------------------------------------------------

  /** Runs `fn` and publishes once, however many nested changes it caused. */
  private batch(fn: () => void): void {
    this.depth += 1;
    try {
      fn();
    } finally {
      this.depth -= 1;
      if (this.depth === 0) this.flush();
    }
  }

  private flush(): void {
    if (this.disposed) return;
    if (this.stateDirty) this.handlers.onStateChange?.(this.state);
    if (this.dirty || this.stateDirty) {
      this.snapshot = this.buildSnapshot();
      for (const listener of [...this.listeners]) listener();
      this.publishPhones();
    }
    if (this.hostDirty) {
      this.hostDirty = false;
      this.publishHost();
    }
    this.dirty = false;
    this.stateDirty = false;
  }

  /** Reduces one engine action; true when the engine accepted it. */
  private apply(action: WheelAction): boolean {
    const prev = this.state;
    const stamped: WheelAction = action.at === undefined ? { ...action, at: this.env.now() } : action;
    const next = wheelReduce(prev, stamped);
    if (next === prev) return false;
    this.batch(() => {
      this.state = next;
      this.afterChange(prev, next, action);
    });
    return true;
  }

  private afterChange(prev: WheelState, next: WheelState, action: WheelAction): void {
    const events = next.events.filter((e) => e.seq > this.lastSeq);
    this.lastSeq = next.eventSeq;
    this.stateDirty = true;
    this.dirty = true;

    const presentation = PRESENTATION.includes(action.type);
    // A clock or reveal that carries the game to a new phase (the Frenzy ending, a toss-up filling in)
    // is a new moment for the host, however it came about.
    const moved = prev.phase !== next.phase || prev.stage !== next.stage;
    if (!presentation && action.type !== 'PROVIDE_PUZZLES') this.clearTransients();
    if (!presentation || moved) {
      this.rev += 1;
      this.hostDirty = true;
    }
    if (action.type === 'SET_TURN_TIMER') this.hostDirty = true;

    // A ruling taken back must not play its sound (AUDIO_CUES_V1.md, "Delayed cues").
    const takenBack =
      action.type === 'UNDO' ||
      action.type === 'HOST_SOLVE_OVERRIDE' ||
      events.some((e) => e.type === 'undo' || e.type === 'puzzle-thrown-out');
    if (takenBack) {
      this.timers.cancelPrefix('cue:');
      this.timers.cancel('plate');
      this.timers.cancel('plate-wait');
      this.plate = null;
      if (this.spin) this.endSpin(false);
    }

    if (SPIN_ACTIONS.includes(action.type) && this.spin === null) {
      this.beginSpin(action, prev, events);
    } else if (this.spin !== null) {
      // Bell, bank fixes and the clock setting are mirrored; the rest of the display waits for the wheel.
      this.display = this.mirror(this.display, action, next);
      this.processEvents(events, next);
    } else {
      this.display = next;
      this.processEvents(events, next);
      const notice = vowelNoticeCue(prev, next);
      if (notice) this.playCue(notice);
    }

    if (action.type === 'LIGHT_NEXT') this.audio.play('wof_letter_light', { overlap: true });
    this.reportContentUsed();
    this.rebeginEffects();
  }

  /** While the wheel turns, presentation-only changes and bank fixes still reach the display. */
  private mirror(display: WheelState, action: WheelAction, next: WheelState): WheelState {
    if (PRESENTATION.includes(action.type) || action.type === 'ADJUST_BANK') {
      const mirrored = wheelReduce(display, action);
      return mirrored === display ? display : { ...mirrored, events: next.events, eventSeq: next.eventSeq };
    }
    return display;
  }

  private clearTransients(): void {
    if (this.vowelPick !== null) this.vowelPick = null;
    if (this.pending !== null) this.pending = null;
  }

  /** Everything that follows a change: puzzles, lights, clocks, beds. Idempotent. */
  private rebeginEffects(): void {
    if (!this.started || this.disposed) return;
    this.settleRequest();
    this.reconcile();
  }

  // --- puzzles ---------------------------------------------------------------------------------------

  private settleRequest(): void {
    const s = this.state;
    if (!s.request || s.phase !== 'awaiting-puzzles' || this.starvedFor === s.request) return;
    const puzzles = providePuzzles(s, s.request, {
      used: this.provided,
      rng: this.rng,
      ...(this.options.puzzles ? { puzzles: this.options.puzzles } : {}),
    });
    if (puzzles.length === 0) {
      this.starvedFor = s.request;
      logger.warn('[wheel] no content for request', s.request.use);
      return;
    }
    for (const p of puzzles) this.provided.add(p.id);
    this.apply({ type: 'PROVIDE_PUZZLES', puzzles });
    if (this.state === s) this.starvedFor = s.request;
  }

  private reportContentUsed(): void {
    const fresh = this.state.seen.filter((id) => !this.reportedSeen.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) this.reportedSeen.add(id);
    this.handlers.onContentUsed?.(fresh);
  }

  // --- events: cues, plates, flashes -----------------------------------------------------------------

  private processEvents(events: readonly WheelEvent[], state: WheelState): void {
    if (events.length === 0) return;
    for (const cue of cuesFor(events, state)) this.playCue(cue);
    const types = events.map((e) => e.type);
    for (const ev of events) {
      switch (ev.type) {
        case 'wild-card-played':
          this.wildCardPlaying = ev.team ?? null;
          break;
        case 'bankrupt':
          this.showPlate({ kind: 'bankrupt', team: ev.team ?? null }, types.includes('mystery-flip'));
          break;
        case 'lose-turn':
          this.showPlate({ kind: 'lose-turn', team: ev.team ?? null }, false);
          break;
        case 'wild-card-claimed':
          this.showPlate({ kind: 'wild-card', team: ev.team ?? null }, false);
          break;
        case 'million-claimed':
          this.showPlate({ kind: 'million', team: ev.team ?? null }, false);
          break;
        case 'mystery-flip':
          if ((ev.amount ?? 0) > 0) this.showPlate({ kind: 'mystery-win', team: ev.team ?? null }, true);
          break;
        case 'solve-correct':
        case 'tossup-correct':
        case 'bonus-solved':
          this.showFlash('good');
          break;
        case 'solve-wrong':
        case 'tossup-wrong':
        case 'letter-miss':
        case 'letter-repeat':
        case 'time-out':
        case 'bonus-wrong':
          this.showFlash('bad');
          break;
        default:
          break;
      }
      if (
        ['letter-correct', 'letter-miss', 'letter-repeat', 'turn', 'segment'].includes(ev.type) &&
        ev.type !== 'wild-card-played'
      )
        this.wildCardPlaying = null;
    }
  }

  private playCue(cue: CuePlay): void {
    const play = (): void => {
      this.audio.play(cue.cue, cue.overlap === true ? { overlap: true } : undefined);
    };
    if (cue.delayMs <= 0) {
      play();
      return;
    }
    this.cueSeq += 1;
    this.timers.schedule(`cue:${String(this.cueSeq)}`, cue.delayMs, play);
  }

  private showPlate(plate: PlateUi, delayed: boolean): void {
    const show = (): void => {
      this.batch(() => {
        this.plate = plate;
        this.dirty = true;
        this.timers.schedule('plate', PLATE_MS, () => {
          this.batch(() => {
            this.plate = null;
            this.dirty = true;
          });
        });
      });
    };
    if (delayed) this.timers.schedule('plate-wait', 1800, show);
    else show();
  }

  private showFlash(kind: 'good' | 'bad'): void {
    this.flash = kind;
    this.dirty = true;
    this.timers.schedule('flash', FLASH_MS, () => {
      this.batch(() => {
        this.flash = null;
        this.dirty = true;
      });
    });
  }

  // --- the spin --------------------------------------------------------------------------------------

  private beginSpin(action: WheelAction, prev: WheelState, events: WheelEvent[]): void {
    const draw =
      action.type === 'SPIN' || action.type === 'SPEEDUP_SPIN' || action.type === 'BONUS_SPIN'
        ? action.draw
        : this.rng();
    const kind: SpinKind = action.type === 'BONUS_SPIN' ? 'bonus' : 'wheel';
    const plan = planSpin({
      draw,
      wedgeCount: 24,
      startDeg: kind === 'bonus' ? this.bonusDeg : this.wheelDeg,
      kind,
      reducedMotion: this.reducedMotion,
    });
    // The audience keeps seeing the state from before the spin until the wheel stops.
    this.display = prev;
    this.heldEvents = events.filter((e) => e.type !== 'bonus-spin');
    this.spin = { plan, startedAt: this.activeNow(), lastFrame: 0 };
    if (kind === 'bonus') this.audio.play('wof_bonus_spin');
    this.timers.schedule('spin', plan.frameMs, () => {
      this.spinFrame();
    });
  }

  private spinFrame(): void {
    const run = this.spin;
    if (!run) return;
    this.batch(() => {
      const { plan } = run;
      const elapsed = this.activeNow() - run.startedAt;
      const frame = Math.min(plan.frames, Math.floor(elapsed / plan.frameMs));
      if (frame > run.lastFrame) {
        if (plan.kind === 'wheel' && plan.tickFrames.some((f) => f > run.lastFrame && f <= frame)) {
          this.audio.play('spin_tick', { overlap: true });
        }
        run.lastFrame = frame;
        const deg = angleAtFrame(plan, frame);
        if (plan.kind === 'bonus') this.bonusDeg = deg;
        else this.wheelDeg = deg;
        this.dirty = true;
      }
      if (frame >= plan.frames) {
        this.endSpin(true);
        this.rebeginEffects();
      } else {
        this.timers.schedule('spin', plan.frameMs, () => {
          this.spinFrame();
        });
      }
    });
  }

  /** The wheel stopped (`release`) or was cut short by an undo: the held result goes on show. */
  private endSpin(release: boolean): void {
    const run = this.spin;
    if (!run) return;
    this.spin = null;
    this.timers.cancel('spin');
    const rest = run.plan.endDeg % 360;
    if (run.plan.kind === 'bonus') this.bonusDeg = rest;
    else this.wheelDeg = rest;
    this.display = this.state;
    const held = this.heldEvents;
    this.heldEvents = [];
    this.dirty = true;
    if (release) {
      this.processEvents(held, this.state);
      if (run.plan.kind === 'bonus') this.audio.play('wof_bonus_chime');
    }
    this.hostDirty = true;
  }

  // --- reconcile: timers and beds follow the state ---------------------------------------------------

  private reconcile(): void {
    const s = this.state;
    const holding = this.spin !== null;

    // Letter lighting: one queued tile every 450 ms.
    const queued = (s.puzzle?.queue.length ?? 0) > 0;
    if (queued && !holding) {
      if (!this.timers.has('light')) {
        this.timers.schedule('light', LIGHT_INTERVAL_MS, () => {
          this.apply({ type: 'LIGHT_NEXT' });
        });
      }
    } else this.timers.cancel('light');

    // Toss-up reveals: a random hidden tile every 900 ms while the letters are appearing.
    const revealing =
      isTossupLike(s) &&
      s.phase === 'tossup-reveal' &&
      s.puzzle !== null &&
      hiddenTileIndices(s.puzzle).length > 0;
    if (revealing) {
      if (!this.timers.has('reveal')) {
        this.timers.schedule('reveal', TOSSUP_REVEAL_MS, () => {
          this.apply({ type: 'TOSSUP_REVEAL_NEXT', draw: this.rng() });
        });
      }
    } else this.timers.cancel('reveal');
    this.syncLoop('tossup', revealing && s.stage !== 'frenzy', 'wof_tossup_bed');
    this.syncLoop('express', s.stage === 'round' && s.phase === 'express-run', 'wof_express_bed');

    this.reconcileFrenzy();
    this.reconcileTurnClock();
    this.reconcileBonusClock();

    if (this.envelopeOpening && s.phase !== 'bonus-won' && s.phase !== 'bonus-timeup') {
      this.envelopeOpening = false;
      this.timers.cancel('envelope');
      this.audio.stop('wof_envelope');
      this.dirty = true;
    }
  }

  private syncLoop(flag: 'tossup' | 'express', want: boolean, cue: SoundName): void {
    const current = flag === 'tossup' ? this.tossupBed : this.expressBed;
    if (want === current) return;
    if (flag === 'tossup') this.tossupBed = want;
    else this.expressBed = want;
    if (want) this.audio.loop(cue);
    else this.audio.stopLoop(cue);
  }

  /** Fortune Frenzy: the engine clock ticks with the real elapsed time and the 30 s bed follows it. */
  private reconcileFrenzy(): void {
    const s = this.state;
    const f = s.frenzy;
    const running =
      s.stage === 'frenzy' &&
      f !== null &&
      f.started &&
      !f.expired &&
      f.msLeft > 0 &&
      s.phase !== 'tossup-done';
    if (running) {
      if (!this.frenzyOn) {
        this.frenzyOn = true;
        this.frenzyAnchor = this.activeNow();
        this.audio.bed('wof_frenzy_bed', { offsetSec: (f.durationMs - f.msLeft) / 1000 });
        this.hostDirty = true;
      }
      if (!this.timers.has('frenzy')) {
        this.timers.schedule('frenzy', Math.min(FRENZY_TICK_MS, f.msLeft), () => {
          const now = this.activeNow();
          const ms = Math.max(1, now - this.frenzyAnchor);
          this.frenzyAnchor = now;
          this.apply({ type: 'FRENZY_TICK', ms });
        });
      }
    } else {
      this.timers.cancel('frenzy');
      if (this.frenzyOn) {
        this.frenzyOn = false;
        this.audio.stop('wof_frenzy_bed');
        this.hostDirty = true;
      }
    }
  }

  /**
   * The decision clock (off / 5 / 10 s, live) and the Speed-Up's 3 s solve window. A clock starts when
   * the decision it times begins and only once the board has settled (no spin, no tile still lighting).
   */
  private reconcileTurnClock(): void {
    const s = this.state;
    let want: { key: string; ms: number } | null = null;
    const settled = this.spin === null && (s.puzzle?.queue.length ?? 0) === 0 && this.pending === null;
    if (isRoundLike(s) && s.turn !== null && s.puzzle !== null && settled) {
      const stamp = `${String(s.turn)}|${s.phase}|${String(s.puzzle.called.length)}|${String(s.spin?.index ?? -1)}`;
      if (s.phase === 'speedup-window') want = { key: `window|${stamp}`, ms: SPEEDUP_WINDOW_MS };
      else if (TURN_PHASES.includes(s.phase) && s.settings.turnTimerSec > 0)
        want = {
          key: `turn|${stamp}|${String(s.settings.turnTimerSec)}`,
          ms: s.settings.turnTimerSec * 1000,
        };
    }
    const key = want?.key ?? null;
    if (key === this.turnKey) return;
    this.turnKey = key;
    this.timers.cancel('turn');
    this.hostDirty = true;
    this.dirty = true;
    if (!want) return;
    const team = s.turn;
    this.timers.schedule('turn', want.ms, () => {
      if (team === null) return;
      if (this.apply({ type: 'TIME_OUT', team })) this.lastTimeOut = { team, at: this.env.now() };
    });
  }

  private reconcileBonusClock(): void {
    const s = this.state;
    const running = s.stage === 'bonus' && s.phase === 'bonus-solving';
    if (running === this.bonusOn) return;
    this.bonusOn = running;
    this.hostDirty = true;
    this.dirty = true;
    if (running) {
      this.audio.bed('wof_bonus_clock_10');
      this.timers.schedule('bonus', BONUS_CLOCK_MS, () => {
        this.apply({ type: 'BONUS_TIME_UP' });
      });
    } else {
      this.timers.cancel('bonus');
      this.audio.stop('wof_bonus_clock_10');
    }
  }

  // --- the end of the game ---------------------------------------------------------------------------

  /** The winner card is shown first; the report goes out when the host continues, exactly once. */
  private endGame(): CommandResult {
    const result = gameResult(this.state);
    if (!result) return no('illegal');
    if (this.gameReported) return no('duplicate');
    this.gameReported = true;
    this.audio.stopAll();
    this.handlers.onGameEnd?.({
      winnerId: result.winnerId,
      roundScore: result.score,
      extraScores: Object.entries(result.extraScores).map(([team, points]) => ({
        team: Number(team),
        points,
      })),
      bonusChips: result.bonusChips,
    });
    return ok;
  }

  // --- phones ----------------------------------------------------------------------------------------

  private publishPhones(): void {
    if (!this.started) return;
    const s = this.display;
    let controls: PhoneControls;
    if (this.spin !== null) {
      controls = {
        ...IDLE_PHONE_CONTROLS,
        activeTeam: s.turn,
        turnName: this.teamName(s.turn),
        buzzTeams: [],
        offLabel: 'SPINNING',
      };
    } else {
      const c = phoneControls(s);
      controls = { ...c };
      if (c.buzzTeams && c.buzzTeams.length > 0 && c.buzzTeams.length < s.teams.length) {
        controls.offLabel = s.teams.some((t) => t.lockedOut)
          ? 'Locked out of this puzzle'
          : 'Not in this tiebreaker';
      }
    }
    this.options.phones.publishControls(controls);
  }

  private teamName(id: TeamId | null): string {
    return this.state.teams.find((t) => t.id === id)?.name ?? '';
  }

  private handlePress(team: TeamId, pressId: string, at: number): void {
    if (this.disposed || this.locked) {
      this.options.phones.ack(team, pressId, false);
      return;
    }
    const s = this.state;
    let accepted = false;
    if (this.spin !== null) accepted = false;
    else if (isTossupLike(s)) accepted = this.apply({ type: 'BUZZ', team, at });
    else if (
      s.turn === team &&
      (s.phase === 'choose' || s.phase === 'speedup-spin' || s.phase === 'bonus-spin')
    )
      accepted = this.doSpin();
    this.options.phones.ack(team, pressId, accepted);
  }

  private handlePhoneAction(
    team: TeamId,
    pressId: string,
    action: 'buy' | 'spin' | 'solve' | 'solve-start' | 'solve-cancel',
    answer: string | undefined,
  ): void {
    if (this.disposed || this.locked || this.spin !== null) {
      this.options.phones.ack(team, pressId, false);
      return;
    }
    let accepted = false;
    this.batch(() => {
      switch (action) {
        case 'buy': {
          const letter = answer === undefined ? null : parseLetter(answer);
          if (this.actingTeam() !== team) break;
          if (letter !== null && isVowel(letter)) accepted = this.apply({ type: 'BUY_VOWEL', letter });
          else if (this.legalNow().includes('BUY_VOWEL')) {
            this.vowelPick = team;
            this.dirty = true;
            accepted = true;
          }
          break;
        }
        case 'spin':
          accepted = this.actingTeam() === team && this.doSpin();
          break;
        case 'solve-start':
          accepted = this.startSolve(team);
          break;
        case 'solve-cancel':
          accepted = this.state.solve?.team === team && this.apply({ type: 'SOLVE_CANCEL' });
          break;
        case 'solve':
          accepted = this.submitAnswer(team, answer ?? '', 'phone');
          break;
      }
    });
    this.options.phones.ack(team, pressId, accepted);
  }

  // --- judging ---------------------------------------------------------------------------------------

  /** The team a command about the current moment acts for (FR-017). */
  private actingTeam(): TeamId | null {
    const s = this.state;
    if (s.stage === 'bonus') return s.bonus?.team ?? null;
    if (s.phase === 'tossup-answer') return s.tossup?.buzzed ?? null;
    if (s.phase === 'solving') return s.solve?.team ?? s.turn;
    return s.turn;
  }

  private legalNow(): readonly WheelActionType[] {
    return legalActions(this.state);
  }

  private startSolve(team: TeamId): boolean {
    const s = this.state;
    const late = this.lateSolveOpen();
    if (late && s.timedOutCtx?.team === team) return this.apply({ type: 'LATE_SOLVE' });
    if (this.actingTeam() !== team) return false;
    if (s.stage === 'bonus') return true; // bonus guesses need no SOLVE_START
    return this.apply({ type: 'SOLVE_START' });
  }

  /** True while a solve may still be given back to the team that timed out. */
  private lateSolveOpen(): boolean {
    const t = this.lastTimeOut;
    return t !== null && this.env.now() - t.at <= LATE_SOLVE_GRACE_MS && canLateSolve(this.state);
  }

  /** Judges `answer` and applies the verdict; a close answer waits for the host (never shown to the room). */
  private submitAnswer(team: TeamId, answer: string, source: 'phone' | 'stage'): boolean {
    const s = this.state;
    const phrase = s.puzzle?.puzzle.phrase;
    if (phrase === undefined || answer.trim() === '') return false;
    if (s.stage === 'bonus') {
      if (s.bonus?.team !== team) return false;
    } else if (s.phase === 'tossup-answer') {
      if (s.tossup?.buzzed !== team) return false;
    } else if (s.phase !== 'solving') {
      if (!this.startSolve(team)) return false;
    } else if (s.solve?.team !== team) return false;
    const verdict = judgeSolve(answer, phrase);
    if (verdict === 'close') {
      this.pending = { team, answer, source };
      this.hostDirty = true;
      this.dirty = true;
      this.rev += 1;
      return true;
    }
    return this.resolve(verdict === 'correct');
  }

  /** Applies a correct/wrong ruling to whatever is open: a solve, a toss-up answer or a Bonus guess. */
  private resolve(correct: boolean): boolean {
    const s = this.state;
    const verdict = correct ? 'correct' : 'wrong';
    if (s.stage === 'bonus') return this.apply({ type: 'BONUS_SOLVE', verdict });
    if (s.phase === 'tossup-answer' && s.tossup?.buzzed != null)
      return this.apply({ type: 'TOSSUP_ANSWER', team: s.tossup.buzzed, verdict });
    return this.apply({ type: 'SOLVE', verdict });
  }

  // --- spinning --------------------------------------------------------------------------------------

  private doSpin(): boolean {
    const s = this.state;
    const draw = this.rng();
    if (s.stage === 'bonus') return this.apply({ type: 'BONUS_SPIN', draw });
    if (s.stage === 'speedup') return this.apply({ type: 'SPEEDUP_SPIN', draw });
    return this.apply({ type: 'SPIN', draw });
  }

  // --- commands --------------------------------------------------------------------------------------

  private handleHostCommand(command: HostCommand): CommandResult {
    if (this.disposed) return no('disposed');
    const now = this.env.now();
    this.prune(now);
    const known = this.seenCmd.get(command.cmdId);
    if (known) return known.result;
    const result = this.decide(command, now);
    this.seenCmd.set(command.cmdId, { at: now, result });
    return result;
  }

  private decide(command: HostCommand, now: number): CommandResult {
    if (this.locked && this.options.allowHostWhileLocked !== true) return no('locked');
    if (command.name !== 'undo' && command.gameRev < this.rev) return no('stale');
    const signature = stableStringify([command.name, command.args ?? null, command.teamId ?? null]);
    const last = this.recent.get(signature);
    if (last !== undefined && now - last < HOST_REPEAT_MS) return no('duplicate');
    if (TEAM_STAMPED.includes(command.name) && command.teamId !== undefined && !this.stampOk(command)) {
      return no('wrong-team');
    }
    const result = this.execute(command.name, command.args, command.teamId);
    if (result.applied) this.recent.set(signature, now);
    return result;
  }

  private stampOk(command: HostCommand): boolean {
    const acting = this.actingTeam();
    if (command.teamId === acting) return true;
    const ruling = this.state.lastRuling;
    return command.name === 'rule' && ruling !== null && ruling.team === command.teamId;
  }

  private prune(now: number): void {
    for (const [id, entry] of this.seenCmd) if (now - entry.at > CMD_MEMORY_MS) this.seenCmd.delete(id);
    for (const [sig, at] of this.recent) if (now - at >= HOST_REPEAT_MS) this.recent.delete(sig);
  }

  /**
   * The stage's own buttons and keys call this with the same names the host console sends, so a click,
   * a key and a host-view command are one code path (FR-013). Repeats within 500 ms count once.
   */
  run(name: string, args?: Record<string, unknown>, teamId?: number): CommandResult {
    if (this.disposed) return no('disposed');
    if (this.locked) return no('locked');
    const now = this.env.now();
    this.prune(now);
    const signature = stableStringify([name, args ?? null, teamId ?? null]);
    const last = this.recent.get(signature);
    if (last !== undefined && now - last < HOST_REPEAT_MS) return no('duplicate');
    const result = this.execute(name, args, teamId);
    if (result.applied) this.recent.set(signature, now);
    return result;
  }

  private execute(
    name: string,
    args: Record<string, unknown> | undefined,
    teamId: number | undefined,
  ): CommandResult {
    let result: CommandResult = no('illegal');
    this.batch(() => {
      result = this.executeNow(name, args, teamId);
    });
    return result;
  }

  private executeNow(
    name: string,
    args: Record<string, unknown> | undefined,
    teamId: number | undefined,
  ): CommandResult {
    const s = this.state;
    const act = (action: WheelAction): CommandResult => (this.apply(action) ? ok : no('illegal'));

    // While the wheel turns only the harmless tools and Undo (which cuts the spin short) are accepted.
    if (
      this.spin !== null &&
      !['undo', 'ring-bell', 'adjust-bank', 'set-turn-timer', 'save-settings'].includes(name)
    ) {
      return no('spinning');
    }

    switch (name) {
      case 'spin':
        return this.doSpin() ? ok : no('illegal');
      case 'letter':
      case 'call-letter':
      case 'buy-vowel': {
        const raw = argString(args, 'letter');
        const letter = raw === undefined ? null : parseLetter(raw);
        if (letter === null) return no('bad-args');
        const tries: WheelAction[] =
          name === 'buy-vowel'
            ? [{ type: 'BUY_VOWEL', letter }]
            : s.stage === 'bonus'
              ? [{ type: 'BONUS_CALL_LETTER', letter }]
              : [
                  { type: 'CALL_LETTER', letter },
                  { type: 'BUY_VOWEL', letter },
                ];
        for (const a of tries) {
          const withAt = { ...a, at: this.env.now() } as WheelAction;
          if (wheelReduce(s, withAt) !== s) return act(withAt);
        }
        return no('illegal');
      }
      case 'solve-start':
        return this.startSolve(teamId ?? this.lateTeam() ?? this.actingTeam() ?? -1) ? ok : no('illegal');
      case 'solve-cancel':
        return act({ type: 'SOLVE_CANCEL' });
      case 'solve': {
        const answer = argString(args, 'answer') ?? '';
        const team = teamId ?? this.actingTeam();
        if (team === null) return no('illegal');
        return this.submitAnswer(team, answer, 'stage') ? ok : no('illegal');
      }
      case 'rule': {
        const verdict = argString(args, 'verdict');
        if (verdict !== 'correct' && verdict !== 'wrong') return no('bad-args');
        return act({ type: 'HOST_SOLVE_OVERRIDE', verdict });
      }
      case 'accept-pending':
      case 'reject-pending': {
        if (this.pending === null) return no('illegal');
        const correct = name === 'accept-pending';
        this.pending = null;
        this.hostDirty = true;
        this.dirty = true;
        return this.resolve(correct) ? ok : no('illegal');
      }
      case 'mystery': {
        const choice = argString(args, 'choice');
        if (choice === 'keep') return act({ type: 'MYSTERY', choice: 'keep' });
        if (choice === 'flip') return act({ type: 'MYSTERY', choice: 'flip', draw: this.rng() });
        return no('bad-args');
      }
      case 'express': {
        const choice = argString(args, 'choice');
        return choice === 'play' || choice === 'pass' ? act({ type: 'EXPRESS', choice }) : no('bad-args');
      }
      case 'play-wild-card':
        return act({ type: 'PLAY_WILD_CARD' });
      case 'ring-bell':
        return act({ type: 'RING_BELL' });
      case 'continue':
        return s.stage === 'game-over' ? this.endGame() : act({ type: 'CONTINUE' });
      case 'light-all':
        return act({ type: 'LIGHT_ALL' });
      case 'skip-turn':
        return act({ type: 'SKIP_TURN' });
      case 'set-turn': {
        const team = argNumber(args, 'team') ?? teamId;
        return team === undefined ? no('bad-args') : act({ type: 'SET_TURN', team });
      }
      case 'throw-out':
        return act({ type: 'THROW_OUT_PUZZLE' });
      case 'end-unsolved':
        return act({ type: 'END_ROUND_UNSOLVED' });
      case 'adjust-bank': {
        const team = argNumber(args, 'team') ?? teamId;
        const delta = argNumber(args, 'delta');
        return team === undefined || delta === undefined
          ? no('bad-args')
          : act({ type: 'ADJUST_BANK', team, delta });
      }
      case 'late-solve':
        return act({ type: 'LATE_SOLVE' });
      case 'accept-late':
        return act({ type: 'BONUS_ACCEPT_LATE' });
      case 'undo':
        return act({ type: 'UNDO' });
      case 'set-turn-timer': {
        const sec = argNumber(args, 'sec');
        if (sec !== 0 && sec !== 5 && sec !== 10) return no('bad-args');
        this.nextSettings = { ...this.nextSettings, turnTimerSec: sec };
        this.handlers.onSettingsSave?.(this.nextSettings);
        this.hostDirty = true;
        this.dirty = true;
        this.apply({ type: 'SET_TURN_TIMER', sec });
        return ok;
      }
      case 'bonus-category': {
        const category = argString(args, 'category');
        return category === undefined ? no('bad-args') : act({ type: 'BONUS_PICK_CATEGORY', category });
      }
      case 'open-envelope':
        return this.openEnvelope();
      case 'save-settings': {
        this.nextSettings = parseWheelSettings({
          ...this.nextSettings,
          ...args,
          turnTimerSec: this.state.settings.turnTimerSec,
        });
        this.handlers.onSettingsSave?.(this.nextSettings);
        this.hostDirty = true;
        this.dirty = true;
        return ok;
      }
      case 'open-vowel-pick': {
        if (!this.legalNow().includes('BUY_VOWEL')) return no('illegal');
        this.vowelPick = this.actingTeam();
        this.dirty = true;
        return ok;
      }
      case 'close-vowel-pick':
        this.vowelPick = null;
        this.dirty = true;
        return ok;
      default:
        return no('unknown-command');
    }
  }

  /** While a late solve is still open, the team to give it back to. */
  private lateTeam(): TeamId | null {
    return this.lateSolveOpen() ? (this.state.timedOutCtx?.team ?? null) : null;
  }

  /** Opens the sealed envelope after 3 s of suspense that pauses and resumes with the game. */
  private openEnvelope(): CommandResult {
    const s = this.state;
    if ((s.phase !== 'bonus-won' && s.phase !== 'bonus-timeup') || s.bonus?.opened !== false)
      return no('illegal');
    if (this.envelopeOpening) return no('duplicate');
    this.envelopeOpening = true;
    this.dirty = true;
    this.hostDirty = true;
    this.audio.bed('wof_envelope');
    this.timers.schedule('envelope', ENVELOPE_SUSPENSE_MS, () => {
      this.batch(() => {
        this.envelopeOpening = false;
        this.apply({ type: 'BONUS_OPEN_ENVELOPE' });
        this.dirty = true;
      });
    });
    return ok;
  }

  // --- snapshots -------------------------------------------------------------------------------------

  private clockSnapshot(): ClockSnapshot | null {
    const s = this.state;
    const asOf = this.env.now();
    const running = this.pausedAt === null;
    if (this.frenzyOn && s.frenzy) {
      const elapsed = running ? Math.max(0, this.activeNow() - this.frenzyAnchor) : 0;
      return {
        kind: 'frenzy',
        label: 'FORTUNE FRENZY',
        totalMs: s.frenzy.durationMs,
        remainingMs: Math.max(0, s.frenzy.msLeft - elapsed),
        running,
        asOf,
      };
    }
    const pick = (id: string, kind: ClockSnapshot['kind'], label: string): ClockSnapshot | null => {
      const remaining = this.timers.remaining(id);
      const total = this.timers.totalOf(id);
      if (remaining === null || total === null) return null;
      return { kind, label, totalMs: total, remainingMs: remaining, running, asOf };
    };
    return (
      pick('bonus', 'bonus', 'BONUS CLOCK') ??
      pick('envelope', 'envelope', 'THE ENVELOPE') ??
      pick(
        'turn',
        s.phase === 'speedup-window' ? 'window' : 'turn',
        s.phase === 'speedup-window' ? 'SOLVE NOW' : 'YOUR TURN',
      )
    );
  }

  private currentPhone(): PhoneControls {
    return { ...phoneControls(this.display) };
  }

  private buildSnapshot(): WheelUiSnapshot {
    const s = this.state;
    const holding = this.spin !== null;
    return {
      rev: this.rev,
      view: audienceView(this.display),
      teamColors: this.teamColors,
      inputLocked: this.locked,
      menuOpen: this.menuOpen,
      spinning: holding,
      spinKind: this.spin?.plan.kind ?? null,
      wheelDeg: this.wheelDeg,
      bonusDeg: this.bonusDeg,
      legal: holding ? [] : legalActions(s),
      letters: holding ? { call: [], buy: [], bonus: [] } : legalLetters(s),
      actingTeam: this.actingTeam(),
      canLateSolve: !holding && this.lateSolveOpen(),
      vowelPickTeam: this.vowelPick,
      judging: this.pending ? { team: this.pending.team, source: this.pending.source } : null,
      plate: this.plate,
      flash: this.flash,
      clock: this.clockSnapshot(),
      envelopeOpening: this.envelopeOpening,
      result: gameResult(s),
      phone: this.currentPhone(),
      nextSettings: this.nextSettings,
      continueLabel: holding ? null : continueLabel(s),
      notice: vowelNotice(this.display),
      wildCardPlaying: this.wildCardPlaying,
      spinEarned: this.display.spin?.earned ?? 0,
    };
  }

  private publishHost(): void {
    if (!this.started) return;
    const data = buildWheelHostData({
      state: this.state,
      phone: this.currentPhone(),
      clock: this.clockSnapshot(),
      pending: this.pending,
      nextSettings: this.nextSettings,
      spinning: this.spin !== null,
      acting: this.actingTeam(),
    });
    this.options.host.publishSnapshot({ kind: 'wheel', gameRev: this.rev, inputLocked: this.locked, data });
  }
}
