/**
 * Family Feud controller (design.md section 8.1, FR-014, FR-016, FR-030..037). A framework-free class
 * that owns the engine state and everything around it: the "survey says" beats, the host-only answer
 * and steal clocks, the Fast Money clock, cues (once per engine event), voice, typed and phone
 * answers, host commands and the host snapshot. React reads it through `subscribe`/`getSnapshot`
 * (useSyncExternalStore). The engine decides every rule; this class only turns people, clocks and
 * microphones into engine actions.
 */
import { countFreshSurveys, pickFastMoney, pickSurvey } from '@/content';
import type { FeudRound, FeudSurvey } from '@/content';
import type { SoundName } from '@/audio/cues';
import type { AudioPlayer } from '@/audio/player';
import type { Team } from '@/engines/event';
import { createFeudState, feudReducer } from '@/engines/feud/feudEngine';
import {
  FM_P1_MS,
  FM_P2_MS,
  REVEAL_STEPS,
  activePlayer,
  currentQuestionIndex,
  fastMoneyTotal,
  rawPoints,
} from '@/engines/feud/fastMoney';
import {
  audienceView,
  gameEndReport,
  hostView,
  whoIsAnswering,
  type Answering,
  type HostView,
} from '@/engines/feud/selectors';
import type {
  FastMoneyAction,
  FeudAction,
  FeudEvent,
  FeudState,
  FeudSurveyInput,
  Side,
} from '@/engines/feud/types';
import type { CommandResult, HostBridge, HostCommand } from '@/host/hostProtocol';
import { normalizeAnswer } from '@/judging/normalize';
import { matchAnswer, matchAnswerAlternatives, type MatchResult } from '@/judging/answerMatching';
import { IDLE_PHONE_CONTROLS } from '@/stage/gameContract';
import type { GameEndReport, PhoneBridge, PhoneControls } from '@/stage/gameContract';
import { Countdown, type ClockEnv } from './clock';
import { ANSWER_TIMER_EVENTS, holdAfter, planCues, type CueStep } from './feudCues';
import { buildHostControls, advanceLabel, type HostControl } from './hostControls';
import { playerName, sayThis, stakeTexts } from './hostLines';
import { defaultRuntime, type FeudRuntime } from './runtime';
import { parseSavedState } from './savedState';
import { parseFeudSettings, toEngineSettings, type FeudSettings } from './settings';
import type { SpeechRecognizerSession } from './speech';
import { FEUD_TIMING } from './timing';
import type {
  AnswerSource,
  BrowserEntry,
  ClockView,
  FeudContentView,
  FeudHostData,
  FeudSavedState,
  FeudTeamInfo,
  FeudTeams,
  FeudViewModel,
  FmCheck,
  MicView,
  PendingReview,
} from './types';

// ------------------------------------------------------------------------------ public types

export type FeudAudio = Pick<AudioPlayer, 'play' | 'bed' | 'stop' | 'pauseAll' | 'resumeAll'>;

export interface FeudMatch {
  /** Team ids playing as family A and family B. */
  a: number;
  b: number;
  /** "Match N of M" for a bracket. */
  number?: number;
  of?: number;
}

export interface FeudControllerDeps {
  teams: readonly Team[];
  match: FeudMatch;
  usedContentIds: readonly string[];
  onContentUsed: (ids: string[]) => void;
  onStateChange: (state: unknown) => void;
  onGameEnd: (report: GameEndReport) => void;
  audio: FeudAudio;
  phones: PhoneBridge;
  host: HostBridge;
  settings?: Partial<FeudSettings>;
  initialState?: unknown;
  inputLocked?: boolean;
  runtime?: Partial<FeudRuntime>;
}

/** The parts of the deps a component may change while the game runs. */
export type FeudLiveDeps = Partial<
  Pick<
    FeudControllerDeps,
    'teams' | 'usedContentIds' | 'onContentUsed' | 'onStateChange' | 'onGameEnd' | 'settings'
  >
>;

type PressMessage = Parameters<Parameters<PhoneBridge['onPress']>[0]>[0];
type FeudAnswerMessage = Parameters<Parameters<PhoneBridge['onFeudAnswer']>[0]>[0];

type Role = Answering['role'];
type Slot = number | 'miss' | 'repeat';

const OK: CommandResult = { applied: true };
const no = (reason: string): CommandResult => ({ applied: false, reason });
const result = (applied: boolean, reason: string): CommandResult => (applied ? OK : no(reason));

/** Commands that are not tied to one moment of the game, so a stale stamp does not matter. */
const STAMP_EXEMPT: ReadonlySet<string> = new Set(['hold-answer', 'browse', 'mic']);
/** Commands the console sends in bursts (typing); never dropped as repeats. */
const REPEAT_EXEMPT: ReadonlySet<string> = new Set(['hold-answer', 'browse']);

const ROUND_PHASES: readonly string[] = [
  'face-off',
  'play-or-pass',
  'control',
  'steal-confer',
  'steal-answer',
];

const PASS_WORDS: ReadonlySet<string> = new Set(['pass', 'i pass', 'we pass', 'passed']);
const isPassText = (text: string): boolean => PASS_WORDS.has(normalizeAnswer(text));

const toInput = (survey: Pick<FeudSurvey, 'id' | 'question' | 'answers'>): FeudSurveyInput => ({
  id: survey.id,
  question: survey.question,
  answers: survey.answers.map((entry) => ({
    answer: entry.answer,
    points: entry.points,
    ...(entry.aliases ? { aliases: entry.aliases } : {}),
  })),
});

const stable = (value: unknown): string => {
  if (typeof value !== 'object' || value === null) {
    // JSON.stringify(undefined) is undefined at runtime although typed as a string.
    const text = JSON.stringify(value) as string | undefined;
    return text ?? 'undefined';
  }
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${key}:${stable(record[key])}`)
    .join(',')}}`;
};

const asInt = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) ? value : null;

const asSide = (value: unknown): Side | null => (value === 'A' || value === 'B' ? value : null);

const isTick = (action: FeudAction): boolean => action.type === 'FAST_MONEY' && action.sub.type === 'TICK';

interface Ruling {
  action: FeudAction;
  text: string | null;
  slot: number | 'miss';
}

interface HeldCue {
  step: CueStep;
}

// ------------------------------------------------------------------------------ controller

export class FeudController {
  private deps: FeudControllerDeps;
  private readonly runtime: FeudRuntime;
  private readonly env: ClockEnv;

  private settings: FeudSettings;
  private engine: FeudState;
  private gameRev = 0;
  private locked: boolean;
  private started = false;

  private readonly usedLocal = new Set<string>();
  private endReported = false;
  private jackpotCued = false;
  private lastCuedSeq: number;

  private review: PendingReview | null = null;
  private reviewCounter = 0;
  private fmChecks: FmCheck[] = [];
  private ruling: Ruling | null = null;
  private overlay: { id: number; count: number } | null = null;
  private overlayCounter = 0;
  private overlayTimer: unknown = null;
  private browserOpen = false;

  // clocks
  private readonly answerClock: Countdown;
  private answerTurnKey: string | null = null;
  private readonly stealClock: Countdown;
  private readonly rulingClock: Countdown;
  private typingUntil = 0;
  private typingTimer: unknown = null;
  private fmInterval: unknown = null;
  private fmLastTick = 0;
  private fmBedOn: SoundName | null = null;
  private fmRevealTimer: unknown = null;
  private lastPersistAt = 0;

  // cues
  private readonly cueTimers = new Set<unknown>();
  private heldCues: HeldCue[] = [];

  // voice
  private session: SpeechRecognizerSession | null = null;
  private sessionToken = 0;
  private activeKey: string | null = null;
  private typedKey: string | null = null;
  private stoppedKey: string | null = null;
  private quickEnds = 0;
  private transcript = '';
  /** The steal turn the host switched the mic on for by hand. */
  private micManualFor: string | null = null;

  // host and phones
  private unsubs: (() => void)[] = [];
  private readonly recentCommands = new Map<string, number>();
  private readonly pressResults = new Map<string, boolean>();
  private lastControlsJson = '';

  // React bridge
  private readonly listeners = new Set<() => void>();
  private version = 0;
  private cached: { version: number; view: FeudViewModel } | null = null;

  constructor(deps: FeudControllerDeps) {
    this.deps = deps;
    this.runtime = { ...defaultRuntime(), ...deps.runtime };
    const rt = this.runtime;
    this.env = {
      now: () => rt.now(),
      setTimeout: (fn, ms) => rt.setTimeout(fn, ms),
      clearTimeout: (id) => {
        rt.clearTimeout(id);
      },
    };
    this.settings = parseFeudSettings(deps.settings);
    this.locked = deps.inputLocked ?? false;

    this.answerClock = new Countdown(
      this.env,
      {
        onWarn: () => {
          this.playNow({ cue: 'ff_time_warn', delayMs: 0 });
        },
        onExpire: () => {
          this.onAnswerExpired();
        },
      },
      FEUD_TIMING.timeWarnAtMs,
    );
    this.stealClock = new Countdown(this.env, {
      onExpire: () => {
        this.onStealExpired();
      },
    });
    this.rulingClock = new Countdown(this.env, {
      onExpire: () => {
        this.flushRuling();
      },
    });

    const saved = parseSavedState(deps.initialState);
    if (saved !== null) {
      this.engine = saved.engine;
      this.gameRev = saved.gameRev;
      for (const id of saved.usedLocal) this.usedLocal.add(id);
      this.endReported = saved.endReported;
      this.jackpotCued = saved.jackpotCued;
      this.review = saved.review;
      this.reviewCounter = saved.review?.id ?? 0;
      this.fmChecks = saved.fmChecks;
      this.savedClocks = saved.clocks;
    } else {
      this.engine = createFeudState({
        families: {
          A: { teamId: String(deps.match.a), podiumSize: this.podiumOf(deps.match.a) },
          B: { teamId: String(deps.match.b), podiumSize: this.podiumOf(deps.match.b) },
        },
        settings: toEngineSettings(this.settings),
      });
    }
    this.lastCuedSeq = this.engine.seq - 1;
  }

  private savedClocks: FeudSavedState['clocks'] | null = null;

  // ============================================================================ React bridge

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): FeudViewModel => {
    if (this.cached?.version !== this.version) {
      this.cached = { version: this.version, view: this.buildView() };
    }
    return this.cached.view;
  };

  /** The state the stage persists; also what a restore starts from. */
  getSavedState(): FeudSavedState {
    const answer = this.answerClock.isActive() ? this.answerClock.view() : null;
    const steal = this.stealClock.isActive() ? this.stealClock.view() : null;
    return {
      version: 1,
      engine: this.engine,
      gameRev: this.gameRev,
      usedLocal: [...this.usedLocal],
      endReported: this.endReported,
      jackpotCued: this.jackpotCued,
      review: this.review,
      fmChecks: this.fmChecks,
      clocks: {
        answer:
          answer !== null && this.answerTurnKey !== null
            ? {
                remainingMs: answer.remainingMs,
                leadMs: answer.leadMs,
                totalMs: answer.totalMs,
                turnKey: this.answerTurnKey,
              }
            : null,
        steal:
          steal === null
            ? null
            : { remainingMs: steal.remainingMs, leadMs: steal.leadMs, totalMs: steal.totalMs },
      },
    };
  }

  /** Test and debugging access to the engine state. */
  getEngineState(): FeudState {
    return this.engine;
  }

  getGameRev(): number {
    return this.gameRev;
  }

  // ============================================================================ lifecycle

  /** Subscribes to commands and phones, re-arms clocks and publishes. Safe to call again after `stop`. */
  start(): void {
    if (this.started) return;
    this.started = true;
    const { host, phones } = this.deps;
    this.unsubs = [
      host.onCommand('feud', (command) => this.handleCommand(command)),
      phones.onPress((press) => {
        this.handlePress(press);
      }),
      phones.onFeudAnswer((answer) => {
        this.handlePhoneAnswer(answer);
      }),
    ];
    this.restoreClocks();
    if (this.locked) this.deps.audio.pauseAll();
    this.reconcile([]);
    this.finish(false);
  }

  /** Cancels every timer, session and subscription. */
  stop(): void {
    if (!this.started) return;
    this.started = false;
    for (const off of this.unsubs) off();
    this.unsubs = [];
    this.answerClock.pause();
    this.stealClock.pause();
    this.rulingClock.pause();
    this.clearTimer('typing');
    this.stopFmTicker();
    this.clearTimer('reveal');
    this.clearTimer('overlay');
    this.cancelCueTimers();
    this.stopSession();
    this.activeKey = null;
    if (this.fmBedOn !== null) this.deps.audio.stop(this.fmBedOn);
    this.fmBedOn = null;
  }

  /** Newer props from the component (callbacks, teams, used ids, settings). */
  update(live: FeudLiveDeps): void {
    const { settings, ...rest } = live;
    const previous = this.deps;
    this.deps = { ...this.deps, ...rest };
    if (settings !== undefined) this.updateSettings(settings);
    if (live.teams !== undefined && live.teams !== previous.teams) this.finish(false);
  }

  updateSettings(partial: Partial<FeudSettings>): void {
    const next = parseFeudSettings({ ...this.settings, ...partial });
    if (JSON.stringify(next) === JSON.stringify(this.settings)) return;
    this.settings = next;
    if (this.started) {
      this.reconcile([], true);
      this.finish(false);
    }
  }

  setInputLocked(locked: boolean): void {
    if (locked === this.locked) return;
    this.locked = locked;
    if (locked) {
      this.deps.audio.pauseAll();
    } else {
      this.deps.audio.resumeAll();
      this.fmLastTick = this.runtime.now();
      this.releaseHeldCues();
    }
    if (!this.started) return;
    this.reconcileFm();
    this.applyHolds();
    this.finish(false);
  }

  // ============================================================================ engine plumbing

  private dispatch(action: FeudAction): boolean {
    const prev = this.engine;
    const next = feudReducer(prev, action);
    if (next === prev) return false;
    this.engine = next;
    this.afterChange(prev, next, action);
    return true;
  }

  private fm(sub: FastMoneyAction): boolean {
    return this.dispatch({ type: 'FAST_MONEY', sub });
  }

  private afterChange(prev: FeudState, next: FeudState, action: FeudAction): void {
    if (isTick(action) && next.seq === prev.seq) {
      this.onTick();
      return;
    }
    this.gameRev += 1;
    const events = next.events.filter((event) => event.seq > this.lastCuedSeq);
    this.lastCuedSeq = next.seq - 1;
    if (events.some((event) => event.type === 'UNDONE' || event.type === 'SURVEY_REPLACED')) {
      this.cancelCueTimers();
      this.clearTimer('reveal');
      this.review = null;
      this.cancelRuling();
      this.clearOverlay();
    }
    this.playCues(events, prev, next);
    this.trackOverlay(events);
    this.pruneChecks();
    this.reconcile(events);
    this.finish(true);
  }

  /** A Fast Money tick that did not end the turn: only the clock display moves. */
  private onTick(): void {
    this.version += 1;
    this.notify();
    const now = this.runtime.now();
    if (now - this.lastPersistAt >= FEUD_TIMING.persistTickMs) {
      this.lastPersistAt = now;
      this.deps.onStateChange(this.getSavedState());
    }
  }

  private finish(persist: boolean): void {
    this.syncListening();
    this.version += 1;
    if (persist) {
      this.lastPersistAt = this.runtime.now();
      this.deps.onStateChange(this.getSavedState());
    }
    if (this.started) {
      this.publishHost();
      this.publishControls();
    }
    this.notify();
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }

  // ============================================================================ cues

  private playCues(events: readonly FeudEvent[], prev: FeudState, next: FeudState): void {
    const plan = planCues(events, prev, next, { jackpotCued: this.jackpotCued });
    this.jackpotCued = plan.flags.jackpotCued;
    for (const step of plan.steps) {
      if (step.delayMs <= 0) {
        this.playNow(step);
      } else {
        const id = this.runtime.setTimeout(() => {
          this.cueTimers.delete(id);
          this.playNow(step);
        }, step.delayMs);
        this.cueTimers.add(id);
      }
    }
  }

  private playNow(step: CueStep): void {
    if (this.locked) {
      this.heldCues.push({ step });
      return;
    }
    this.deps.audio.play(step.cue, step.overlap === true ? { overlap: true } : undefined);
  }

  private releaseHeldCues(): void {
    const held = this.heldCues;
    this.heldCues = [];
    for (const { step } of held) this.playNow(step);
  }

  /** A cue still waiting is dropped when an Undo lands first (AUDIO_CUES_V1.md, Delayed cues). */
  private cancelCueTimers(): void {
    for (const id of this.cueTimers) this.runtime.clearTimeout(id);
    this.cueTimers.clear();
    this.heldCues = [];
  }

  private trackOverlay(events: readonly FeudEvent[]): void {
    let count = 0;
    for (const event of events) {
      if (event.type === 'FACEOFF_X') count = 1;
      else if (event.type === 'STRIKE') count = event.strikes;
      else if (event.type === 'STEAL_RESULT' && !event.success) count = 1;
    }
    if (count === 0) return;
    this.overlayCounter += 1;
    this.overlay = { id: this.overlayCounter, count };
    this.clearTimer('overlay');
    this.overlayTimer = this.runtime.setTimeout(() => {
      this.overlayTimer = null;
      this.overlay = null;
      this.version += 1;
      this.notify();
    }, FEUD_TIMING.strikeOverlayMs);
  }

  private clearOverlay(): void {
    this.clearTimer('overlay');
    this.overlay = null;
  }

  private clearTimer(which: 'typing' | 'reveal' | 'overlay'): void {
    const key = which === 'typing' ? 'typingTimer' : which === 'reveal' ? 'fmRevealTimer' : 'overlayTimer';
    const id = this[key];
    if (id !== null) this.runtime.clearTimeout(id);
    this[key] = null;
  }

  // ============================================================================ clocks

  /** Brings every clock and the Fast Money ticker in line with the engine after a change. */
  private reconcile(events: readonly FeudEvent[], force = false): void {
    this.reconcileAnswerClock(events, force);
    this.reconcileStealClock();
    this.reconcileFm();
    this.applyHolds();
  }

  private reconcileAnswerClock(events: readonly FeudEvent[], force: boolean): void {
    const answering = whoIsAnswering(this.engine);
    const seconds = this.settings.answerTimerSec;
    const timed =
      answering !== null && (answering.role === 'face-off' || answering.role === 'control') && seconds > 0;
    if (!timed) {
      this.answerClock.cancel();
      this.answerTurnKey = null;
      return;
    }
    const faceOff = this.engine.faceOff;
    const key = [
      this.engine.phase,
      answering.side,
      answering.playerIndex.toString(),
      faceOff?.stage ?? '',
      faceOff?.pair.toString() ?? '',
    ].join(':');
    const totalMs = seconds * 1000;
    const restart =
      force ||
      !this.answerClock.isActive() ||
      key !== this.answerTurnKey ||
      this.answerClock.view().totalMs !== totalMs ||
      events.some((event) => ANSWER_TIMER_EVENTS.has(event.type));
    if (restart) {
      this.answerClock.begin(totalMs, holdAfter(events, this.engine));
      this.answerTurnKey = key;
    }
  }

  private reconcileStealClock(): void {
    const seconds = this.settings.stealTimerSec;
    if (this.engine.phase !== 'steal-confer' || seconds === 0) {
      if (this.stealClock.isActive()) this.stealClock.cancel();
      return;
    }
    if (!this.stealClock.isActive()) this.stealClock.begin(seconds * 1000);
  }

  /** Runs each clock only when nothing holds it (pause, typing, a ruling beat, a host review). */
  private applyHolds(): void {
    const typing = this.runtime.now() < this.typingUntil;
    const runAnswer = !this.locked && !typing && this.review === null && this.ruling === null;
    const hold = (clock: Countdown, run: boolean): void => {
      if (!clock.isActive()) return;
      if (run) clock.resume();
      else clock.pause();
    };
    hold(this.answerClock, runAnswer);
    hold(this.stealClock, !this.locked);
    hold(this.rulingClock, !this.locked);
  }

  /** Typing or speaking holds the answer timer for a moment and takes over from the microphone. */
  private holdTyping(ms: number = FEUD_TIMING.typingHoldMs): void {
    this.typingUntil = this.runtime.now() + ms;
    this.clearTimer('typing');
    this.typingTimer = this.runtime.setTimeout(() => {
      this.typingTimer = null;
      this.applyHolds();
      this.notifyView();
    }, ms);
    this.applyHolds();
  }

  private notifyView(): void {
    this.version += 1;
    if (this.started) this.publishHost();
    this.notify();
  }

  private onAnswerExpired(): void {
    const answering = whoIsAnswering(this.engine);
    if (answering === null || this.ruling !== null || this.review !== null) return;
    // "TIME'S UP!" is a strike, or a face-off miss.
    this.ruleNow(this.answerAction(answering.role, 'miss', 'timeout'));
  }

  private onStealExpired(): void {
    this.dispatch({ type: 'END_CONFER' });
  }

  private restoreClocks(): void {
    const saved = this.savedClocks;
    this.savedClocks = null;
    if (saved === null) return;
    const answering = whoIsAnswering(this.engine);
    if (saved.answer !== null && answering !== null && this.settings.answerTimerSec > 0) {
      this.answerClock.restore(saved.answer);
      this.answerTurnKey = saved.answer.turnKey;
    }
    if (saved.steal !== null && this.engine.phase === 'steal-confer' && this.settings.stealTimerSec > 0) {
      this.stealClock.restore(saved.steal);
    }
  }

  // ---------------------------------------------------------------------------- Fast Money clock

  private reconcileFm(): void {
    const fm = this.engine.fastMoney;
    const player = this.engine.phase === 'fast-money' && fm !== null ? activePlayer(fm) : null;
    const running = fm !== null && player !== null && fm.clock.running;

    if (running && !this.locked) this.startFmTicker();
    else this.stopFmTicker();

    const desired: SoundName | null = running ? (player === 1 ? 'ff_fm_clock_20' : 'ff_fm_clock_25') : null;
    if (desired !== this.fmBedOn) {
      if (this.fmBedOn !== null) this.deps.audio.stop(this.fmBedOn);
      this.fmBedOn = desired;
      if (desired !== null && fm !== null) {
        const total = player === 1 ? FM_P1_MS : FM_P2_MS;
        this.deps.audio.bed(desired, { offsetSec: Math.max(0, (total - fm.clock.remainingMs) / 1000) });
      }
    }
  }

  private startFmTicker(): void {
    if (this.fmInterval !== null) return;
    this.fmLastTick = this.runtime.now();
    this.fmInterval = this.runtime.setInterval(() => {
      const now = this.runtime.now();
      const elapsed = now - this.fmLastTick;
      this.fmLastTick = now;
      if (this.locked || elapsed <= 0) return;
      // The real elapsed time is credited, so a throttled tab does not give free seconds.
      this.fm({ type: 'TICK', ms: elapsed });
    }, FEUD_TIMING.fmTickMs);
  }

  private stopFmTicker(): void {
    if (this.fmInterval === null) return;
    this.runtime.clearInterval(this.fmInterval);
    this.fmInterval = null;
  }

  // ============================================================================ content

  private usedIds(): string[] {
    return [...this.deps.usedContentIds, ...this.usedLocal];
  }

  private markUsed(ids: readonly string[]): void {
    const fresh = ids.filter((id) => !this.usedLocal.has(id) && !this.deps.usedContentIds.includes(id));
    for (const id of ids) this.usedLocal.add(id);
    if (fresh.length > 0) this.deps.onContentUsed(fresh);
  }

  private roundForPick(): FeudRound {
    if (this.engine.phase === 'sudden-death' || this.engine.suddenDeath) return 'sudden-death';
    const round = Math.min(Math.max(this.engine.roundNumber, 1), 4);
    return round as 1 | 2 | 3 | 4;
  }

  private pickSurveyInput(): FeudSurveyInput | null {
    const survey = pickSurvey(
      this.roundForPick(),
      this.usedIds(),
      this.runtime.rng,
      this.runtime.content().surveys,
    );
    return survey === undefined ? null : toInput(survey);
  }

  private findSurvey(id: string): FeudSurveyInput | null {
    const found = this.runtime.content().surveys.find((survey) => survey.id === id);
    return found === undefined ? null : toInput(found);
  }

  // ============================================================================ flow

  /** The Enter key: the next step for this moment. */
  private advance(): CommandResult {
    if (this.ruling !== null) {
      this.flushRuling();
      return OK;
    }
    if (this.review !== null) return no('The host review comes first');
    const state = this.engine;
    switch (state.phase) {
      case 'pre-game':
        if (!this.dispatch({ type: 'START_GAME', settings: toEngineSettings(this.settings) })) {
          return no('Cannot start the game');
        }
        return this.startRound();
      case 'round-intro':
        return this.startRound();
      case 'sudden-death':
        return this.startSuddenDeath();
      case 'face-off':
        return result(this.dispatch({ type: 'OPEN_BUZZERS' }), 'Nothing to open');
      case 'steal-confer':
        return result(this.dispatch({ type: 'END_CONFER' }), 'Not at the huddle');
      case 'round-decided':
        return result(this.dispatch({ type: 'REVEAL_NEXT' }), 'Nothing left to reveal');
      case 'round-summary':
        return this.nextRound();
      case 'game-won':
        return this.startFastMoney();
      case 'fast-money':
        return this.advanceFastMoney();
      case 'game-over':
        return this.continueGame();
      default:
        return no('Nothing to advance');
    }
  }

  private startRound(): CommandResult {
    const survey = this.pickSurveyInput();
    if (survey === null) return no('No survey is available');
    if (!this.dispatch({ type: 'START_ROUND', survey })) return no('Cannot start the round');
    this.markUsed([survey.id]);
    return OK;
  }

  private startSuddenDeath(): CommandResult {
    const survey = this.pickSurveyInput();
    if (survey === null) return no('No survey is available');
    if (!this.dispatch({ type: 'START_SUDDEN_DEATH', survey })) return no('Cannot start Sudden Death');
    this.markUsed([survey.id]);
    return OK;
  }

  private nextRound(): CommandResult {
    if (!this.dispatch({ type: 'NEXT_ROUND' })) return no('The round is not over');
    if (this.engine.phase === 'round-intro') return this.startRound();
    return OK;
  }

  private startFastMoney(): CommandResult {
    if (this.engine.fastMoney === null) {
      return result(this.dispatch({ type: 'SKIP_FAST_MONEY' }), 'Cannot finish the game');
    }
    const size = this.engine.fastMoney.podiumSize;
    const dealt = this.dealFastMoney();
    if (!dealt.applied) return dealt;
    this.fm({ type: 'CHOOSE_PLAYERS', p1: 0, p2: size > 1 ? 1 : 0 });
    return OK;
  }

  private dealFastMoney(): CommandResult {
    const questions = pickFastMoney(this.usedIds(), this.runtime.rng, this.runtime.content().fastMoney);
    const inputs = questions.map(toInput);
    if (!this.fm({ type: 'PROVIDE_QUESTIONS', questions: inputs })) return no('Cannot deal questions');
    this.markUsed(questions.map((question) => question.id));
    return OK;
  }

  private advanceFastMoney(): CommandResult {
    const fm = this.engine.fastMoney;
    if (fm === null) return no('No Fast Money');
    if (fm.phase === 'p1-ready' || fm.phase === 'p2-ready') {
      return result(this.fm({ type: 'START_CLOCK' }), 'Not ready for the clock');
    }
    if (fm.phase === 'p1-reveal' || fm.phase === 'p2-reveal') {
      return result(this.fm({ type: 'REVEAL_NEXT' }), 'Nothing to reveal');
    }
    return no('Nothing to advance');
  }

  /** "Reveal all" in Fast Money: the steps land one after another so every cue is heard. */
  private revealAllFastMoney(): CommandResult {
    const step = (): void => {
      this.fmRevealTimer = null;
      const fm = this.engine.fastMoney;
      if (fm === null || (fm.phase !== 'p1-reveal' && fm.phase !== 'p2-reveal')) return;
      const at = fm.phase === 'p1-reveal' ? fm.reveal.p1 : fm.reveal.p2;
      // The last step clears the board; the host does that one with Enter.
      if (at >= REVEAL_STEPS - 1) return;
      if (this.locked) {
        this.fmRevealTimer = this.runtime.setTimeout(step, 250);
        return;
      }
      this.fm({ type: 'REVEAL_NEXT' });
      this.fmRevealTimer = this.runtime.setTimeout(step, FEUD_TIMING.fmRevealStepMs);
    };
    const fm = this.engine.fastMoney;
    if (fm === null || (fm.phase !== 'p1-reveal' && fm.phase !== 'p2-reveal')) return no('Nothing to reveal');
    this.clearTimer('reveal');
    step();
    return OK;
  }

  /** Reports the finished game to the event, exactly once (FR-037). */
  private continueGame(): CommandResult {
    if (this.engine.phase !== 'game-over') return no('The game is not over');
    if (this.endReported) return no('Already reported');
    const report = gameEndReport(this.engine);
    if (report === null) return no('No winner to report');
    this.endReported = true;
    this.finish(true);
    this.deps.onGameEnd({
      winnerId: Number(report.winnerId),
      roundScore: report.points,
      extraScores: report.extraScores.map((extra) => ({ team: Number(extra.team), points: extra.points })),
      bonusChips: report.bonusChips,
    });
    return OK;
  }

  // ============================================================================ rulings

  private judgeContext(): Answering | null {
    const answering = whoIsAnswering(this.engine);
    if (answering !== null) return answering;
    const steal = this.engine.steal;
    if (this.engine.phase === 'steal-confer' && steal !== null) {
      return { side: steal.family, playerIndex: 0, role: 'steal' };
    }
    return null;
  }

  private answerAction(role: Role, slot: Slot, cause: 'miss' | 'pass' | 'timeout' = 'miss'): FeudAction {
    if (role === 'face-off') return { type: 'FACEOFF_ANSWER', slot: slot === 'repeat' ? 'miss' : slot };
    if (role === 'steal') return { type: 'STEAL_ANSWER', slot: slot === 'repeat' ? 'miss' : slot };
    return { type: 'ANSWER', slot, cause };
  }

  private ruleNow(action: FeudAction): boolean {
    return this.dispatch(action);
  }

  /** "Survey says..." then the flip (or the X). The engine only changes when the beat is over. */
  private ruleWithBeat(action: FeudAction, text: string | null, slot: number | 'miss'): void {
    this.ruling = { action, text, slot };
    this.runtime.speak('Survey says');
    this.rulingClock.begin(FEUD_TIMING.surveySaysMs);
    this.applyHolds();
    this.finish(false);
  }

  private flushRuling(): void {
    const ruling = this.ruling;
    if (ruling === null) return;
    this.rulingClock.cancel();
    this.ruling = null;
    if (!this.dispatch(ruling.action)) {
      this.applyHolds();
      this.finish(false);
    }
  }

  private cancelRuling(): void {
    this.rulingClock.cancel();
    this.ruling = null;
  }

  private checkTurn(teamId: number | undefined): CommandResult | null {
    if (teamId === undefined) return null;
    const context = this.judgeContext();
    if (context === null) return no('That turn has passed');
    return this.teamIdOf(context.side) === teamId ? null : no('That turn has passed');
  }

  private judgeSlot(slot: number): CommandResult {
    const context = this.judgeContext();
    if (context === null) return no('Nobody is answering');
    if (this.ruling !== null || this.review !== null) return no('A ruling is already waiting');
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.engine.board.length)
      return no('Not a board slot');
    const action = this.answerAction(context.role, slot);
    if (feudReducer(this.engine, action) === this.engine) return no('Not legal now');
    this.ruleWithBeat(action, null, slot);
    return OK;
  }

  private strike(cause: 'miss' | 'timeout' = 'miss'): CommandResult {
    if (this.review !== null) return this.resolveReview('miss', null);
    if (this.ruling !== null) return no('A ruling is already waiting');
    const context = this.judgeContext();
    if (context === null) return no('Nobody is answering');
    return result(this.ruleNow(this.answerAction(context.role, 'miss', cause)), 'Not legal now');
  }

  private passTurn(): CommandResult {
    const state = this.engine;
    if (state.phase === 'play-or-pass') return result(this.dispatch({ type: 'PASS' }), 'Not legal now');
    if (state.phase === 'control') {
      if (this.ruling !== null || this.review !== null) return no('A ruling is already waiting');
      return result(this.ruleNow({ type: 'ANSWER', slot: 'miss', cause: 'pass' }), 'Not legal now');
    }
    if (state.phase === 'fast-money') return result(this.fm({ type: 'PASS' }), 'Not playing');
    return no('Nothing to pass');
  }

  // ---------------------------------------------------------------------------- typed, phone, voice answers

  /** Who may type right now: the host box, the answering team's phone, or both. */
  private allows(source: AnswerSource): boolean {
    const from = this.settings.answersFrom;
    if (source === 'voice') return true;
    if (source === 'host') return from === 'host' || from === 'both';
    return from === 'phones' || from === 'both';
  }

  /**
   * Judges text from the stage box, the console, a phone or the microphone. Clear matches become a
   * ruling beat, near misses go to the host, and every spoken steal answer goes to the host.
   */
  submitText(rawText: string, source: AnswerSource, alternatives?: readonly string[]): CommandResult {
    const text = rawText.trim();
    if (text === '') return no('Empty answer');
    if (!this.allows(source)) return no('Answers from this source are off');
    if (this.ruling !== null || this.review !== null) return no('A ruling is already waiting');
    const context = whoIsAnswering(this.engine);
    if (context === null) return no('Nobody is answering');
    if (source !== 'voice') this.noteTyping();

    if (context.role === 'fast-money') return this.submitFastMoney(text, source);
    if (isPassText(text)) {
      if (context.role === 'control') return this.passTurn();
      return result(this.ruleNow(this.answerAction(context.role, 'miss', 'pass')), 'Not legal now');
    }

    const survey = {
      answers: this.engine.board.map((slot) => ({ answer: slot.answer, aliases: slot.aliases })),
    };
    const verdict: MatchResult =
      alternatives !== undefined && alternatives.length > 0
        ? matchAnswerAlternatives(alternatives, survey)
        : matchAnswer(text, survey);

    if (context.role === 'steal' && source === 'voice') {
      // Every spoken steal answer is the host's call (FR-034).
      return this.openReview(context, text, source, verdict);
    }
    if (verdict.verdict === 'review') return this.openReview(context, text, source, verdict);

    const slot: number | 'miss' =
      verdict.verdict === 'accept' && verdict.slot !== undefined ? verdict.slot : 'miss';
    const action = this.answerAction(context.role, slot);
    if (feudReducer(this.engine, action) === this.engine) return no('Not legal now');
    this.ruleWithBeat(action, text, slot);
    return OK;
  }

  private submitFastMoney(text: string, source: AnswerSource): CommandResult {
    const fm = this.engine.fastMoney;
    if (fm === null) return no('No Fast Money');
    const player = activePlayer(fm);
    const question = currentQuestionIndex(fm);
    if (player === null || question === null) return no('Not playing');
    if (isPassText(text)) return result(this.fm({ type: 'PASS' }), 'Not playing');
    if (source === 'voice') return no('Fast Money never listens');
    const survey = fm.questions[question];
    if (survey === undefined) return no('No question');
    const verdict = matchAnswer(text, survey);
    const slot = verdict.verdict === 'accept' && verdict.slot !== undefined ? verdict.slot : null;
    if (!this.fm({ type: 'ANSWER', text, judged: { slot } })) return no('Not legal now');
    const after = this.engine.fastMoney;
    const record = (player === 1 ? after?.records.p1 : after?.records.p2)?.[question];
    if (verdict.verdict === 'review' && record?.text === text) {
      this.fmChecks = [
        ...this.fmChecks.filter((check) => !(check.player === player && check.question === question)),
        { player, question, text, suggested: verdict.slot ?? null, candidates: [...verdict.candidates] },
      ];
      this.finish(true);
    }
    return OK;
  }

  private openReview(
    context: Answering,
    text: string,
    source: AnswerSource,
    verdict: MatchResult,
  ): CommandResult {
    if (context.role === 'fast-money') return no('Fast Money has its own checks');
    this.reviewCounter += 1;
    this.review = {
      id: this.reviewCounter,
      text,
      source,
      role: context.role,
      side: context.side,
      teamId: this.teamIdOf(context.side),
      playerIndex: context.playerIndex,
      suggestedSlot: verdict.slot ?? verdict.candidates[0] ?? null,
      candidates: [...verdict.candidates],
      confidence: verdict.confidence,
    };
    this.gameRev += 1;
    this.applyHolds();
    this.finish(true);
    return OK;
  }

  private resolveReview(kind: 'accept' | 'miss' | 'ignore' | 'repeat', slot: number | null): CommandResult {
    const review = this.review;
    if (review === null) return no('No review is waiting');
    const context = this.judgeContext();
    if (context === null) {
      this.review = null;
      this.gameRev += 1;
      this.finish(true);
      return no('That turn has passed');
    }
    this.review = null;
    this.gameRev += 1;
    this.typedKey = null;
    if (kind === 'ignore') {
      this.applyHolds();
      this.finish(true);
      return OK;
    }
    if (kind === 'accept') {
      const target = slot ?? review.suggestedSlot;
      if (target === null || !Number.isInteger(target) || target < 0 || target >= this.engine.board.length) {
        this.review = review;
        this.gameRev += 1;
        this.finish(true);
        return no('Pick the answer on the board');
      }
      const action = this.answerAction(context.role, target);
      if (feudReducer(this.engine, action) === this.engine) {
        this.applyHolds();
        this.finish(true);
        return no('Not legal now');
      }
      this.ruleWithBeat(action, review.text, target);
      return OK;
    }
    if (kind === 'repeat') {
      if (context.role === 'control')
        return result(this.ruleNow({ type: 'ANSWER', slot: 'repeat' }), 'Not legal now');
      if (context.role === 'steal')
        return result(this.ruleNow(this.answerAction('steal', 'miss')), 'Not legal now');
      this.applyHolds();
      this.finish(true);
      return OK;
    }
    return result(this.ruleNow(this.answerAction(context.role, 'miss')), 'Not legal now');
  }

  /** Typing (stage box, console or phone) takes over from the microphone for this turn. */
  private noteTyping(): void {
    this.typedKey = this.listenKeyNow();
    this.holdTyping();
    this.syncListening();
  }

  // ============================================================================ voice

  /** The turn the microphone would listen to, ignoring whether it is allowed to. */
  private baseListenKey(): string | null {
    if (this.locked || this.settings.voice !== 'on' || this.runtime.recognizer === null) return null;
    if (this.ruling !== null || this.review !== null) return null;
    const answering = whoIsAnswering(this.engine);
    // Never in Fast Money (FR-034).
    if (answering === null || answering.role === 'fast-money') return null;
    return [
      this.engine.phase,
      answering.side,
      answering.playerIndex.toString(),
      this.gameRev.toString(),
    ].join('|');
  }

  /** The turn the microphone listens to now. The steal only listens when the host switched the mic on. */
  private listenKeyNow(): string | null {
    const key = this.baseListenKey();
    if (key === null) return null;
    if (whoIsAnswering(this.engine)?.role === 'steal') return this.micManualFor === key ? key : null;
    return key;
  }

  private syncListening(): void {
    const key = this.started ? this.listenKeyNow() : null;
    const wanted = key !== null && key !== this.typedKey && key !== this.stoppedKey ? key : null;
    if (wanted === this.activeKey) return;
    this.stopSession();
    this.activeKey = wanted;
    this.quickEnds = 0;
    if (wanted === null) return;
    this.transcript = '';
    this.startSession(wanted);
  }

  private startSession(key: string): void {
    const recognizer = this.runtime.recognizer;
    if (recognizer === null) return;
    this.sessionToken += 1;
    const token = this.sessionToken;
    const startedAt = this.runtime.now();
    this.session = recognizer.start({
      onResult: (alternatives, isFinal) => {
        this.onVoiceResult(key, token, alternatives, isFinal);
      },
      onEnd: () => {
        this.onVoiceEnd(key, token, startedAt);
      },
    });
  }

  private stopSession(): void {
    const session = this.session;
    this.session = null;
    this.sessionToken += 1;
    session?.stop();
  }

  private onVoiceResult(key: string, token: number, alternatives: readonly string[], isFinal: boolean): void {
    // A result belongs to the turn it was started for; anything later is discarded (FR-034).
    if (token !== this.sessionToken || key !== this.activeKey || key !== this.listenKeyNow()) return;
    const best = alternatives[0];
    if (best === undefined) return;
    this.transcript = best;
    this.holdTyping();
    if (!isFinal) {
      this.notifyView();
      return;
    }
    this.submitText(best, 'voice', alternatives);
    this.notifyView();
  }

  private onVoiceEnd(key: string, token: number, startedAt: number): void {
    if (token !== this.sessionToken || key !== this.activeKey) return;
    this.session = null;
    const quick = this.runtime.now() - startedAt < FEUD_TIMING.voiceRestartWindowMs;
    this.quickEnds = quick ? this.quickEnds + 1 : 0;
    if (this.quickEnds > FEUD_TIMING.voiceMaxRestarts) {
      // The mic keeps ending at once: stop restarting it for this turn.
      this.stoppedKey = key;
      this.activeKey = null;
      this.notifyView();
      return;
    }
    this.startSession(key);
    this.notifyView();
  }

  private micView(): MicView {
    if (this.settings.voice !== 'on') return { status: 'off', transcript: '' };
    if (this.runtime.recognizer === null) return { status: 'unavailable', transcript: '' };
    if (this.activeKey !== null) return { status: 'listening', transcript: this.transcript };
    if (this.stoppedKey !== null && this.stoppedKey === this.listenKeyNow()) {
      return { status: 'stopped', transcript: this.transcript };
    }
    return { status: 'off', transcript: this.transcript };
  }

  // ============================================================================ phones

  private handlePress(press: PressMessage): void {
    const done = this.pressResults.get(press.pressId);
    if (done !== undefined) {
      this.deps.phones.ack(press.team, press.pressId, done);
      return;
    }
    const accepted = !this.locked && this.buzz(press.team, press.at).applied;
    this.remember(press.pressId, accepted);
    this.deps.phones.ack(press.team, press.pressId, accepted);
  }

  private remember(pressId: string, accepted: boolean): void {
    this.pressResults.set(pressId, accepted);
    if (this.pressResults.size > FEUD_TIMING.phoneDedupe) {
      const oldest = this.pressResults.keys().next();
      if (!oldest.done) this.pressResults.delete(oldest.value);
    }
  }

  /** A team buzzes (phone press or a stage hotkey): only in an open face-off window, only A or B. */
  private buzz(teamId: number, at: number): CommandResult {
    const side = this.sideOf(teamId);
    if (side === null) return no('Not in this match');
    if (this.engine.phase !== 'face-off' || this.engine.faceOff?.stage !== 'buzzers-open') {
      return no('The buzzers are off');
    }
    return result(this.dispatch({ type: 'BUZZ', team: side, at }), 'The buzzers are off');
  }

  private handlePhoneAnswer(message: FeudAnswerMessage): void {
    const done = this.pressResults.get(message.pressId);
    if (done !== undefined) {
      this.deps.phones.ack(message.team, message.pressId, done);
      return;
    }
    const answering = whoIsAnswering(this.engine);
    // Only the answering team, only while it is their turn (P-004: the stage re-checks everything).
    const allowed =
      !this.locked &&
      answering !== null &&
      this.teamIdOf(answering.side) === message.team &&
      this.allows('phone');
    const accepted = allowed && this.submitText(message.text, 'phone').applied;
    this.remember(message.pressId, accepted);
    this.deps.phones.ack(message.team, message.pressId, accepted);
  }

  private phoneControls(): PhoneControls {
    if (this.locked) return { ...IDLE_PHONE_CONTROLS, offLabel: 'Paused' };
    const state = this.engine;
    if (state.phase === 'face-off' && state.faceOff?.stage === 'buzzers-open') {
      return {
        ...IDLE_PHONE_CONTROLS,
        turnName: 'Face-off',
        buzzTeams: [this.teamIdOf('A'), this.teamIdOf('B')],
        offLabel: 'Not in this match',
      };
    }
    const answering = whoIsAnswering(state);
    if (answering !== null && this.allows('phone') && this.review === null && this.ruling === null) {
      const team = this.teamInfo(answering.side);
      return {
        ...IDLE_PHONE_CONTROLS,
        activeTeam: team.id,
        turnName: team.name,
        buzzTeams: [],
        offLabel: 'TYPE YOUR ANSWER',
      };
    }
    return { ...IDLE_PHONE_CONTROLS };
  }

  private publishControls(): void {
    const controls = this.phoneControls();
    const json = JSON.stringify(controls);
    if (json === this.lastControlsJson) return;
    this.lastControlsJson = json;
    this.deps.phones.publishControls(controls);
  }

  // ============================================================================ host commands

  private handleCommand(command: HostCommand): CommandResult {
    if (this.locked) return no('The game is paused or showing a dialog');
    const now = this.runtime.now();
    for (const [key, at] of this.recentCommands) {
      if (now - at >= FEUD_TIMING.repeatDropMs) this.recentCommands.delete(key);
    }
    if (!REPEAT_EXEMPT.has(command.name)) {
      const byId = `id:${command.cmdId}`;
      const byAction = `act:${command.name}|${command.teamId?.toString() ?? ''}|${stable(command.args)}`;
      const repeated = this.recentCommands.has(byId) || this.recentCommands.has(byAction);
      this.recentCommands.set(byId, now);
      this.recentCommands.set(byAction, now);
      if (repeated) return no('Repeated within half a second');
    }
    if (!STAMP_EXEMPT.has(command.name) && command.gameRev !== this.gameRev) {
      return no('That moment has passed');
    }
    return this.perform(command.name, command.args ?? {}, command.teamId);
  }

  /** The one place every host action lands: stage buttons, hotkeys and host-view commands. */
  run(name: string, args: Record<string, unknown> = {}, teamId?: number): CommandResult {
    if (this.locked) return no('The game is paused or showing a dialog');
    return this.perform(name, args, teamId);
  }

  private perform(name: string, args: Record<string, unknown>, teamId: number | undefined): CommandResult {
    switch (name) {
      case 'advance':
        return this.advance();
      case 'skip-beat':
        if (this.ruling === null) return no('Nothing to skip');
        this.flushRuling();
        return OK;
      case 'open-buzzers':
        return result(this.dispatch({ type: 'OPEN_BUZZERS' }), 'Not legal now');
      case 'buzz': {
        if (teamId === undefined) return no('Which team?');
        return this.buzz(teamId, this.runtime.now());
      }
      case 'who-buzzed-first': {
        const side = asSide(args.team) ?? (teamId === undefined ? null : this.sideOf(teamId));
        if (side === null) return no('Which family?');
        return result(this.dispatch({ type: 'WHO_BUZZED_FIRST', team: side }), 'Not legal now');
      }
      case 'judge-slot': {
        const mismatch = this.checkTurn(teamId);
        if (mismatch !== null) return mismatch;
        const slot = asInt(args.slot);
        return slot === null ? no('Which answer?') : this.judgeSlot(slot);
      }
      case 'strike':
      case 'judge-miss': {
        const mismatch = this.checkTurn(teamId);
        return mismatch ?? this.strike('miss');
      }
      case 'timeout': {
        const mismatch = this.checkTurn(teamId);
        return mismatch ?? this.strike('timeout');
      }
      case 'pass': {
        const mismatch = this.checkTurn(teamId);
        return mismatch ?? this.passTurn();
      }
      case 'repeat': {
        const mismatch = this.checkTurn(teamId);
        if (mismatch !== null) return mismatch;
        if (this.ruling !== null || this.review !== null) return no('A ruling is already waiting');
        return result(this.ruleNow({ type: 'ANSWER', slot: 'repeat' }), 'Not legal now');
      }
      case 'play':
        return result(this.dispatch({ type: 'PLAY' }), 'Not legal now');
      case 'take-captain':
        return result(this.dispatch({ type: 'END_CONFER' }), 'Not at the huddle');
      case 'reveal-next':
        return result(this.dispatch({ type: 'REVEAL_NEXT' }), 'Not legal now');
      case 'reveal-all':
        return result(this.dispatch({ type: 'REVEAL_ALL' }), 'Not legal now');
      case 'next-round':
        return this.nextRound();
      case 'set-multiplier': {
        const value = asInt(args.value);
        if (value !== 1 && value !== 2 && value !== 3) return no('Multiplier is 1, 2 or 3');
        return result(this.dispatch({ type: 'SET_MULTIPLIER', multiplier: value }), 'Not legal now');
      }
      case 'replace-survey':
      case 'use-survey':
        return this.replaceSurvey(typeof args.id === 'string' ? args.id : null);
      case 'skip-fm':
        return result(this.dispatch({ type: 'SKIP_FAST_MONEY' }), 'Cannot skip Fast Money now');
      case 'fm-deal':
        return this.dealFastMoney();
      case 'fm-players': {
        const p1 = asInt(args.p1);
        const p2 = asInt(args.p2);
        if (p1 === null || p2 === null) return no('Which players?');
        return result(this.fm({ type: 'CHOOSE_PLAYERS', p1, p2 }), 'Cannot choose those players');
      }
      case 'fm-pass':
        return result(this.fm({ type: 'PASS' }), 'Not playing');
      case 'fm-pause':
        return result(this.fm({ type: 'PAUSE' }), 'The clock is not running');
      case 'fm-resume':
        return result(this.fm({ type: 'RESUME' }), 'The clock cannot resume');
      case 'fm-reveal-all':
        return this.revealAllFastMoney();
      case 'fm-set-match':
        return this.fmSetMatch(args);
      case 'fm-duplicate-buzzer':
        this.playNow({ cue: 'ff_fm_duplicate', delayMs: 0 });
        return OK;
      case 'fm-end':
        return result(this.fm({ type: 'END_EARLY' }), 'Fast Money is not running');
      case 'submit-text': {
        const text = typeof args.text === 'string' ? args.text : '';
        return this.submitText(text, 'host');
      }
      case 'hold-answer': {
        const ms = typeof args.ms === 'number' && args.ms > 0 ? Math.min(args.ms, 15_000) : undefined;
        const holding = this.runtime.now() < this.typingUntil;
        const status = this.micView().status;
        this.noteTyping();
        if (ms !== undefined) this.holdTyping(ms);
        // Publish when the hold starts or the mic stops, not on every keystroke.
        if (!holding || this.micView().status !== status) this.notifyView();
        return OK;
      }
      case 'review-accept':
        return this.resolveReview('accept', asInt(args.slot));
      case 'review-miss':
        return this.resolveReview('miss', null);
      case 'review-ignore':
        return this.resolveReview('ignore', null);
      case 'review-repeat':
        return this.resolveReview('repeat', null);
      case 'restart-timer':
        this.reconcile([], true);
        this.finish(false);
        return OK;
      case 'undo':
        return this.undo();
      case 'mic': {
        if (args.on === true) {
          this.typedKey = null;
          this.stoppedKey = null;
          this.micManualFor = this.baseListenKey();
        } else {
          this.typedKey = this.listenKeyNow();
          this.micManualFor = null;
        }
        this.syncListening();
        this.notifyView();
        return OK;
      }
      case 'browse':
        this.browserOpen = args.open === true;
        this.notifyView();
        return OK;
      case 'continue':
        return this.continueGame();
      default:
        return no(`Unknown command: ${name}`);
    }
  }

  private undo(): CommandResult {
    if (this.ruling !== null) {
      this.cancelRuling();
      this.applyHolds();
      this.finish(false);
      return OK;
    }
    if (this.review !== null) {
      this.review = null;
      this.gameRev += 1;
      this.applyHolds();
      this.finish(true);
      return OK;
    }
    return result(this.dispatch({ type: 'UNDO' }), 'Nothing to undo');
  }

  private replaceSurvey(id: string | null): CommandResult {
    const phase = this.engine.phase;
    if (id === null && phase !== 'round-intro' && phase !== 'sudden-death') {
      const survey = this.pickSurveyInput();
      if (survey === null) return no('No survey is available');
      if (!this.dispatch({ type: 'REPLACE_SURVEY', survey })) return no('Cannot replace the question now');
      this.markUsed([survey.id]);
      return OK;
    }
    const survey = id === null ? this.pickSurveyInput() : this.findSurvey(id);
    if (survey === null) return no('No such survey');
    let applied = false;
    if (ROUND_PHASES.includes(phase)) applied = this.dispatch({ type: 'REPLACE_SURVEY', survey });
    else if (phase === 'round-intro') applied = this.dispatch({ type: 'START_ROUND', survey });
    else if (phase === 'sudden-death') applied = this.dispatch({ type: 'START_SUDDEN_DEATH', survey });
    if (!applied) return no('Cannot use a question now');
    this.markUsed([survey.id]);
    return OK;
  }

  private fmSetMatch(args: Record<string, unknown>): CommandResult {
    const player = asInt(args.player);
    const question = asInt(args.question);
    const slot = args.slot === null ? null : asInt(args.slot);
    if ((player !== 1 && player !== 2) || question === null) return no('Which answer?');
    const applied = this.fm({ type: 'HOST_SET_MATCH', player, question, slot });
    this.fmChecks = this.fmChecks.filter(
      (check) => !(check.player === player && check.question === question),
    );
    if (!applied) this.finish(true);
    return result(applied, 'That ruling is not allowed');
  }

  private pruneChecks(): void {
    const fm = this.engine.fastMoney;
    if (this.fmChecks.length === 0) return;
    this.fmChecks = this.fmChecks.filter((check) => {
      if (fm === null) return false;
      const record = (check.player === 1 ? fm.records.p1 : fm.records.p2)[check.question];
      return record?.text === check.text && record.slot === null;
    });
  }

  // ============================================================================ teams

  private podiumOf(teamId: number): number {
    const team = this.deps.teams.find((candidate) => candidate.id === teamId);
    return Math.max(1, team?.players.length ?? 1);
  }

  private teamIdOf(side: Side): number {
    return Number(this.engine.families[side].teamId);
  }

  private sideOf(teamId: number): Side | null {
    if (this.teamIdOf('A') === teamId) return 'A';
    if (this.teamIdOf('B') === teamId) return 'B';
    return null;
  }

  private teamInfo(side: Side): FeudTeamInfo {
    const id = this.teamIdOf(side);
    const team = this.deps.teams.find((candidate) => candidate.id === id);
    return {
      id,
      name: team?.name ?? `Team ${id.toString()}`,
      color: team?.color ?? 'var(--c-gold)',
      players: team ? [...team.players] : [],
    };
  }

  private teams(): FeudTeams {
    return { A: this.teamInfo('A'), B: this.teamInfo('B') };
  }

  private matchLabel(): string | null {
    const { number, of } = this.deps.match;
    return number !== undefined && of !== undefined && of > 1
      ? `Match ${number.toString()} of ${of.toString()}`
      : null;
  }

  // ============================================================================ views

  private clockView(clock: Countdown): ClockView | null {
    if (!clock.isActive()) return null;
    const view = clock.view();
    return { ...view, at: this.runtime.now() };
  }

  private fmClockView(): ClockView | null {
    const fm = this.engine.fastMoney;
    if (this.engine.phase !== 'fast-money' || fm === null || activePlayer(fm) === null) return null;
    const total = activePlayer(fm) === 1 ? FM_P1_MS : FM_P2_MS;
    return {
      remainingMs: fm.clock.remainingMs,
      leadMs: 0,
      totalMs: total,
      running: fm.clock.running && !this.locked,
      at: this.runtime.now(),
    };
  }

  private busyControls(host: HostView, names: Record<Side, string>): HostControl[] {
    const controls = buildHostControls(host, {
      names,
      busy: this.ruling !== null || this.review !== null,
    });
    if (this.review !== null) return controls.filter((control) => control.id !== 'advance');
    if (this.ruling !== null) {
      return controls.map((control) =>
        control.id === 'advance' ? { ...control, label: 'Show it now', command: 'skip-beat' } : control,
      );
    }
    return controls;
  }

  private answerSources(): { host: boolean; phones: boolean } {
    return { host: this.allows('host'), phones: this.allows('phone') };
  }

  private buildView(): FeudViewModel {
    const teams = this.teams();
    const host = hostView(this.engine);
    const answering = host.answering;
    const names: Record<Side, string> = { A: teams.A.name, B: teams.B.name };
    const fm = this.fmClockView();
    return {
      gameRev: this.gameRev,
      audience: audienceView(this.engine),
      teams,
      matchLabel: this.matchLabel(),
      settings: this.settings,
      targetScore:
        this.engine.phase === 'pre-game' ? this.settings.targetScore : this.engine.settings.targetScore,
      overlay: this.overlay,
      surveySays: this.ruling !== null,
      controls: this.busyControls(host, names),
      advanceLabel: this.ruling !== null ? 'Show it now' : this.review !== null ? null : advanceLabel(host),
      answerBox: {
        available:
          this.allows('host') &&
          answering !== null &&
          this.ruling === null &&
          this.review === null &&
          !this.locked,
        role: answering?.role ?? null,
      },
      reviewPending: this.review !== null,
      mic: this.micView(),
      fmClockMs: fm === null ? null : fm.remainingMs,
      inputLocked: this.locked,
      endReported: this.endReported,
    };
  }

  private contentView(): FeudContentView {
    const { surveys, fastMoney } = this.runtime.content();
    const used = new Set(this.usedIds());
    const freshSurveys = countFreshSurveys(surveys, used);
    const onBoard = this.engine.survey?.id ?? null;
    const browser: BrowserEntry[] | null = this.browserOpen
      ? surveys.map((survey) => ({
          id: survey.id,
          question: survey.question,
          answers: survey.answers.length,
          used: used.has(survey.id),
          onBoard: survey.id === onBoard,
        }))
      : null;
    return {
      freshSurveys,
      totalSurveys: surveys.length,
      freshFastMoney: fastMoney.filter((question) => !used.has(question.id)).length,
      totalFastMoney: fastMoney.length,
      runningLow: freshSurveys < 10,
      browser,
    };
  }

  private hostData(): FeudHostData {
    const full = hostView(this.engine);
    // The event logs are large and the console does not need them.
    const view: HostView = {
      ...full,
      events: [],
      fastMoney: full.fastMoney === null ? null : { ...full.fastMoney, events: [] },
    };
    const teams = this.teams();
    const names: Record<Side, string> = { A: teams.A.name, B: teams.B.name };
    const answering = full.answering;
    const review = this.review;
    const suggestedAnswer =
      review?.suggestedSlot != null ? (this.engine.board[review.suggestedSlot]?.answer ?? null) : null;
    const fm = this.engine.fastMoney;
    const surveyedText =
      this.engine.survey === null
        ? null
        : (this.runtime.content().surveys.find((survey) => survey.id === this.engine.survey?.id)?.surveyed ??
          null);
    return {
      view,
      teams,
      matchLabel: this.matchLabel(),
      answeringTeamId: answering === null ? null : this.teamIdOf(answering.side),
      answeringName: answering === null ? null : teams[answering.side].name,
      answeringPlayer: answering === null ? null : playerName(teams, answering.side, answering.playerIndex),
      clocks: {
        answer: this.clockView(this.answerClock),
        steal: this.clockView(this.stealClock),
        fastMoney: this.fmClockView(),
      },
      ruling: this.ruling === null ? null : { text: this.ruling.text, slot: this.ruling.slot },
      pendingReview: review === null ? null : { ...review, suggestedAnswer },
      fmChecks: this.fmChecks,
      stakes: stakeTexts(full.stakes, teams),
      sayThis: sayThis(full, teams),
      controls: this.busyControls(full, names),
      advanceLabel: this.ruling !== null ? 'Show it now' : this.review !== null ? null : advanceLabel(full),
      content: this.contentView(),
      settings: this.settings,
      mic: this.micView(),
      answerSources: this.answerSources(),
      surveyedText,
      endReported: this.endReported,
      fmTotals:
        fm === null ? null : { shown: fastMoneyTotal(fm), p1: rawPoints(fm, 1), p2: rawPoints(fm, 2) },
    };
  }

  private publishHost(): void {
    this.deps.host.publishSnapshot({
      kind: 'feud',
      gameRev: this.gameRev,
      inputLocked: this.locked,
      data: this.hostData(),
    });
  }
}
