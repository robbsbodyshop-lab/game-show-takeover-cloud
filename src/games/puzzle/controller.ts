/**
 * Framework-free controller for the puzzle game: owns the engine state, the frame loop, key handling,
 * cues and the menu flow, and exposes a snapshot for React (`useSyncExternalStore`). Everything that
 * touches time takes it from the frame callback, so tests drive it with a fake scheduler.
 */
import { createPuzzleState, eventsSince, reducePuzzle } from '@/engines/puzzle';
import type { MatchState, Mode, PuzzleAction, Speed } from '@/engines/puzzle';
import { BurstTracker } from './bursts';
import type { ActiveBurst } from './bursts';
import { cuesForEvent } from './cueMap';
import { MUSIC_CUE } from './cues';
import type { MusicChoice, PuzzleCue } from './cues';
import { isStartKey, matchIntent, menuIntent } from './keys';
import type { KeyLike } from './keys';
import type { PuzzleAudio } from './puzzleAudio';
import { allReady, createSetup, reduceSetup } from './setup';
import type { SetupAction, SetupState } from './setup';

export const MAX_FRAME_MS = 100;
export const SOFT_DROP_MS = 50;
export const BANNER_HOLD_MS = 1500;

export type Phase = 'title' | 'setup' | 'match';
export type Overlay = 'none' | 'paused' | 'round-over' | 'match-over';

export const TITLE_ITEMS = ['1p', '2p', 'back'] as const;
export type TitleItem = (typeof TITLE_ITEMS)[number];

export interface PuzzleSnapshot {
  phase: Phase;
  titleIndex: number;
  setup: SetupState;
  overlay: Overlay;
  /** The banner hold has passed, so "Press Start" is live. */
  holdDone: boolean;
  match: MatchState;
}

export interface FrameScheduler {
  request(callback: (time: number) => void): number;
  cancel(id: number): void;
}

export interface PuzzleControllerOptions {
  audio: PuzzleAudio;
  /** Leaves the game (title Back or Esc); can be replaced later with `setQuitHandler`. */
  onQuitToHub?: () => void;
  /** Seed of the first match; later matches add 1 each. Random when omitted. */
  seed?: number;
  random?: () => number;
}

interface MatchSettings {
  mode: Mode;
  levels: number[];
  speeds: Speed[];
  music: MusicChoice;
}

export const browserScheduler = (): FrameScheduler => ({
  request: (callback) => window.requestAnimationFrame(callback),
  cancel: (id) => {
    window.cancelAnimationFrame(id);
  },
});

export class PuzzleController {
  private readonly opts: PuzzleControllerOptions;
  private quit: () => void;
  private phase: Phase = 'title';
  private titleIndex = 0;
  private setup: SetupState = createSetup('1p');
  private setupRev = 0;
  private match: MatchState = createPuzzleState();
  private lastSeq = 0;
  private holdMs = 0;
  private holdDone = false;
  private locked = false;
  private animMs = 0;
  private lastFrame: number | null = null;
  private frameId: number | null = null;
  private scheduler: FrameScheduler | null = null;
  private readonly held = [false, false];
  private readonly softAcc = [0, 0];
  private readonly bursts = new BurstTracker();
  private matchCount = 0;
  private settings: MatchSettings | null = null;
  private snapshot: PuzzleSnapshot;
  private snapshotKey = '';
  private readonly listeners = new Set<() => void>();
  private readonly frameListeners = new Set<() => void>();

  constructor(options: PuzzleControllerOptions) {
    this.opts = options;
    this.quit = options.onQuitToHub ?? (() => undefined);
    this.snapshot = this.buildSnapshot();
    this.snapshotKey = this.key();
  }

  // --- React bridge -------------------------------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): PuzzleSnapshot => this.snapshot;

  /** Called after every frame (canvas redraw); never re-renders React. */
  subscribeFrame = (listener: () => void): (() => void) => {
    this.frameListeners.add(listener);
    return () => {
      this.frameListeners.delete(listener);
    };
  };

  getMatch(): MatchState {
    return this.match;
  }

  getAnimMs(): number {
    return this.animMs;
  }

  activeBursts(): ActiveBurst[] {
    return this.bursts.active(this.animMs);
  }

  // --- Loop ---------------------------------------------------------------------------------------

  start(scheduler: FrameScheduler): void {
    this.stop();
    this.scheduler = scheduler;
    this.lastFrame = null;
    this.frameId = scheduler.request(this.onFrame);
  }

  stop(): void {
    if (this.scheduler && this.frameId !== null) this.scheduler.cancel(this.frameId);
    this.frameId = null;
    this.scheduler = null;
  }

  dispose(): void {
    this.stop();
    this.opts.audio.stopMusic();
    this.listeners.clear();
    this.frameListeners.clear();
  }

  setQuitHandler(handler: () => void): void {
    this.quit = handler;
  }

  setInputLocked(locked: boolean): void {
    if (locked === this.locked) return;
    this.locked = locked;
    this.releaseHeld();
    // The first frame after an unlock must not see the whole locked interval as elapsed time.
    this.lastFrame = null;
  }

  private onFrame = (time: number): void => {
    const dt = this.lastFrame === null ? 0 : Math.min(MAX_FRAME_MS, Math.max(0, time - this.lastFrame));
    this.lastFrame = time;
    if (!this.locked) this.advance(dt);
    for (const listener of [...this.frameListeners]) listener();
    if (this.scheduler) this.frameId = this.scheduler.request(this.onFrame);
  };

  private advance(dt: number): void {
    this.animMs += dt;
    if (this.phase !== 'match') return;
    const status = this.match.status;
    if (status === 'playing') {
      this.repeatSoftDrop(dt);
      if (dt > 0) this.dispatch({ type: 'TICK', ms: dt });
    } else if ((status === 'round-over' || status === 'match-over') && !this.holdDone) {
      this.holdMs += dt;
      if (this.holdMs >= BANNER_HOLD_MS) {
        this.holdDone = true;
        if (status === 'match-over' && this.match.matchWinner === null) this.cue('puzzle-game-over');
        this.refresh();
      }
    }
  }

  private repeatSoftDrop(dt: number): void {
    this.held.forEach((isHeld, player) => {
      if (!isHeld) return;
      this.softAcc[player] = (this.softAcc[player] ?? 0) + dt;
      while ((this.softAcc[player] ?? 0) >= SOFT_DROP_MS) {
        this.softAcc[player] = (this.softAcc[player] ?? 0) - SOFT_DROP_MS;
        this.dispatch({ type: 'INPUT', player, input: 'down' });
      }
    });
  }

  private releaseHeld(): void {
    this.held.fill(false);
    this.softAcc.fill(0);
  }

  // --- Engine -------------------------------------------------------------------------------------

  private dispatch(action: PuzzleAction): void {
    const before = this.match;
    const next = reducePuzzle(before, action);
    if (next === before) return;
    this.match = next;
    const fresh = eventsSince(next, this.lastSeq);
    const last = fresh[fresh.length - 1];
    if (last) this.lastSeq = last.seq;
    this.bursts.add(fresh, this.animMs);
    // The match-win fanfare replaces the round-win jingle of the round that decided the match.
    const matchDecided = fresh.some((event) => event.type === 'match-won');
    for (const event of fresh) {
      if (!(matchDecided && event.type === 'round-won')) {
        for (const cue of cuesForEvent(event, next.mode)) this.cue(cue);
      }
      if (event.type === 'paused') this.opts.audio.stopMusic();
      else if (event.type === 'resumed') this.startMusic();
    }
    if (next.status !== before.status && (next.status === 'round-over' || next.status === 'match-over')) {
      this.holdMs = 0;
      this.holdDone = false;
      this.releaseHeld();
      if (next.status === 'match-over') this.opts.audio.stopMusic();
    }
    this.refresh();
  }

  private cue(cue: PuzzleCue): void {
    this.opts.audio.play(cue);
  }

  private startMusic(): void {
    const choice = this.settings?.music ?? 'off';
    if (choice !== 'off') this.opts.audio.startMusic(MUSIC_CUE[choice]);
  }

  // --- Snapshot -----------------------------------------------------------------------------------

  private overlay(): Overlay {
    if (this.phase !== 'match') return 'none';
    switch (this.match.status) {
      case 'paused':
        return 'paused';
      case 'round-over':
        return 'round-over';
      case 'match-over':
        return 'match-over';
      default:
        return 'none';
    }
  }

  private key(): string {
    return [
      this.phase,
      this.titleIndex,
      this.setupRev,
      this.match.status,
      this.match.round,
      this.match.mode,
      this.match.roundWinner ?? 'none',
      this.match.matchWinner ?? 'none',
      this.holdDone,
    ].join('|');
  }

  private buildSnapshot(): PuzzleSnapshot {
    return {
      phase: this.phase,
      titleIndex: this.titleIndex,
      setup: this.setup,
      overlay: this.overlay(),
      holdDone: this.holdDone,
      match: this.match,
    };
  }

  /** Rebuild the snapshot and notify React only when something the DOM shows has changed. */
  private refresh(): void {
    const key = this.key();
    if (key === this.snapshotKey) return;
    this.snapshotKey = key;
    this.snapshot = this.buildSnapshot();
    for (const listener of [...this.listeners]) listener();
  }

  // --- Menu flow ----------------------------------------------------------------------------------

  private moveTitle(delta: number): void {
    const next = Math.max(0, Math.min(TITLE_ITEMS.length - 1, this.titleIndex + delta));
    if (next === this.titleIndex) return;
    this.titleIndex = next;
    this.cue('puzzle-hover');
    this.refresh();
  }

  selectTitle(index: number): void {
    if (this.locked || this.phase !== 'title') return;
    const item = TITLE_ITEMS[index];
    if (!item) return;
    this.titleIndex = index;
    this.cue('puzzle-select');
    if (item === 'back') {
      this.quit();
      return;
    }
    this.setup = createSetup(item, this.setup);
    this.setupRev += 1;
    this.phase = 'setup';
    this.refresh();
  }

  private applySetup(action: SetupAction): void {
    const next = reduceSetup(this.setup, action);
    if (next === this.setup) return;
    this.setup = next;
    this.setupRev += 1;
    this.cue(action.type === 'move' ? 'puzzle-hover' : 'puzzle-select');
    this.refresh();
    if (allReady(next)) this.beginMatch();
  }

  setupAction(action: SetupAction): void {
    if (this.locked || this.phase !== 'setup') return;
    this.applySetup(action);
  }

  private leaveSetup(): void {
    if (this.setup.players.some((p) => p.ready)) {
      this.setup.players.forEach((_, player) => {
        this.setup = reduceSetup(this.setup, { type: 'unready', player });
      });
      this.setupRev += 1;
    } else {
      this.phase = 'title';
    }
    this.cue('puzzle-hover');
    this.refresh();
  }

  private beginMatch(): void {
    const { mode, players, music } = this.setup;
    this.settings = { mode, levels: players.map((p) => p.level), speeds: players.map((p) => p.speed), music };
    const base = this.opts.seed ?? Math.floor((this.opts.random ?? Math.random)() * 0x7fffffff);
    const seed = base + this.matchCount;
    this.matchCount += 1;
    this.lastSeq = 0;
    this.holdMs = 0;
    this.holdDone = false;
    this.bursts.clear();
    this.releaseHeld();
    this.match = createPuzzleState();
    this.dispatch({
      type: 'NEW_MATCH',
      mode,
      levels: this.settings.levels,
      speeds: this.settings.speeds,
      seed,
    });
    if (this.match.status !== 'idle') {
      // Rejected (cannot happen with a valid setup); stay on the setup screen.
      this.refresh();
      return;
    }
    this.phase = 'match';
    this.dispatch({ type: 'START_ROUND' });
    this.opts.audio.stopMusic();
    this.startMusic();
    this.refresh();
  }

  playAgain(): void {
    if (this.locked || this.phase !== 'match' || this.match.status !== 'match-over' || !this.holdDone) return;
    this.cue('puzzle-select');
    this.beginMatch();
  }

  nextRound(): void {
    if (this.locked || this.phase !== 'match' || this.match.status !== 'round-over' || !this.holdDone) return;
    this.bursts.clear();
    this.cue('puzzle-select');
    this.dispatch({ type: 'NEXT_ROUND' });
    this.dispatch({ type: 'START_ROUND' });
  }

  /** The "Press Start" action on either banner (Enter, Space or a click). */
  pressStart(): void {
    if (this.match.status === 'round-over') this.nextRound();
    else if (this.match.status === 'match-over') this.playAgain();
  }

  pause(): void {
    if (!this.locked && this.phase === 'match') this.dispatch({ type: 'PAUSE' });
  }

  resume(): void {
    if (!this.locked && this.phase === 'match') this.dispatch({ type: 'RESUME' });
  }

  quitToTitle(): void {
    if (this.locked) return;
    this.opts.audio.stopMusic();
    this.releaseHeld();
    this.bursts.clear();
    this.match = createPuzzleState();
    this.lastSeq = 0;
    this.holdDone = false;
    this.phase = 'title';
    this.refresh();
  }

  // --- Keyboard -----------------------------------------------------------------------------------

  /** Returns true when the key was ours (the caller then calls `preventDefault`). */
  handleKeyDown(event: KeyLike): boolean {
    if (this.locked) return false;
    if (this.phase === 'match') return this.matchKey(event);
    const solo = this.phase === 'title' || this.setup.mode === '1p';
    const intent = menuIntent(event, solo);
    if (!intent) return false;
    if (event.repeat === true) return true;
    if (this.phase === 'title') {
      if (intent.kind === 'nav') {
        if (intent.dir === 'up' || intent.dir === 'down') this.moveTitle(intent.dir === 'up' ? -1 : 1);
      } else if (intent.kind === 'confirm') this.selectTitle(this.titleIndex);
      else if (intent.kind === 'back') this.quit();
      return true;
    }
    if (intent.kind === 'nav') this.applySetup({ type: 'move', player: intent.player, dir: intent.dir });
    else if (intent.kind === 'confirm') this.applySetup({ type: 'press', player: intent.player });
    else if (intent.kind === 'back') this.leaveSetup();
    return true;
  }

  handleKeyUp(event: KeyLike): void {
    if (this.phase !== 'match') return;
    const intent = matchIntent(event, this.match.players.length);
    if (intent?.kind === 'move' && intent.input === 'down') {
      this.held[intent.player] = false;
      this.softAcc[intent.player] = 0;
    }
  }

  handleBlur(): void {
    this.releaseHeld();
  }

  private matchKey(event: KeyLike): boolean {
    const status = this.match.status;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (status === 'paused') {
      if (event.repeat === true) return true;
      if (key === 'p' || key === 'Escape' || isStartKey(event)) this.resume();
      else if (key === 'q') this.quitToTitle();
      else return false;
      return true;
    }
    if (status === 'round-over' || status === 'match-over') {
      if (event.repeat === true) return key === 'Escape' || isStartKey(event);
      if (key === 'Escape') this.quitToTitle();
      else if (isStartKey(event)) this.pressStart();
      else return false;
      return true;
    }
    const intent = matchIntent(event, this.match.players.length);
    if (!intent) return false;
    if (event.repeat === true) return true;
    if (intent.kind === 'pause') this.pause();
    else if (intent.kind === 'move') {
      if (intent.input === 'down') {
        this.held[intent.player] = true;
        this.softAcc[intent.player] = 0;
      }
      this.dispatch({ type: 'INPUT', player: intent.player, input: intent.input });
    }
    return true;
  }
}
