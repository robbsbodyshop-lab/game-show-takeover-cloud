/**
 * Web Audio player for the cue registry (design.md section 10, docs/reference/AUDIO_CUES_V1.md).
 * Built on a minimal `AudioContext`-like interface so tests can inject a fake. It never throws: a missing
 * file, a failed decode or a broken context logs one warning per cue and playback becomes a no-op.
 */
import { logger } from '../lib/logger.ts';
import { SOUND_FILES } from './cues.ts';
import type { SoundName } from './cues.ts';

// --- The slice of the Web Audio API the player uses -----------------------------------------------

export interface AudioBufferLike {
  readonly duration: number;
}
export interface AudioParamLike {
  value: number;
}
export interface GainNodeLike {
  readonly gain: AudioParamLike;
  connect(destination: unknown): unknown;
  disconnect(): void;
}
export interface BufferSourceLike {
  buffer: AudioBufferLike | null;
  loop: boolean;
  onended: ((event?: unknown) => void) | null;
  connect(destination: unknown): unknown;
  disconnect(): void;
  start(when?: number, offset?: number): void;
  stop(when?: number): void;
}
export interface AudioContextLike {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: unknown;
  createGain(): GainNodeLike;
  createBufferSource(): BufferSourceLike;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike>;
  resume(): Promise<void>;
}

export interface WarnLogger {
  warn: (...args: unknown[]) => void;
}

export interface AudioPlayerOptions {
  /** The audio context; `null` makes every method a silent no-op (no Web Audio in this browser). */
  context: AudioContextLike | null;
  /** Fetch a cue file's bytes; defaults to `fetch`. */
  loadBytes?: (url: string) => Promise<ArrayBuffer>;
  logger?: WarnLogger;
  /** Cue name to URL; defaults to the registry. */
  files?: Readonly<Record<string, string>>;
}

export interface PlayOptions {
  /** Let a short cue ring over its previous play instead of restarting it. */
  overlap?: boolean;
}
export interface BedOptions {
  /** Start this many seconds into the bed (a clock that was already running). */
  offsetSec?: number;
}

type VoiceKind = 'once' | 'loop' | 'bed';

interface Voice {
  readonly name: SoundName;
  readonly kind: VoiceKind;
  readonly buffer: AudioBufferLike;
  /** Null while paused. */
  source: BufferSourceLike | null;
  /** Context time the current source started and the position it started from. */
  startedAt: number;
  offset: number;
  /** Position held while paused. */
  position: number;
}

interface PendingRequest {
  readonly name: SoundName;
  readonly kind: VoiceKind;
  cancelled: boolean;
}

const defaultLoadBytes = async (url: string): Promise<ArrayBuffer> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.arrayBuffer();
};

export class AudioPlayer {
  private readonly ctx: AudioContextLike | null;
  private readonly loadBytes: (url: string) => Promise<ArrayBuffer>;
  private readonly log: WarnLogger;
  private readonly files: Readonly<Record<string, string>>;
  private master: GainNodeLike | null = null;
  private volume = 1;
  private paused = false;
  private voices: Voice[] = [];
  private pending = new Set<PendingRequest>();
  private readonly decoded = new Map<SoundName, Promise<AudioBufferLike | null>>();
  private readonly buffers = new Map<SoundName, AudioBufferLike>();
  private readonly warned = new Set<string>();

  constructor(options: AudioPlayerOptions) {
    this.ctx = options.context;
    this.loadBytes = options.loadBytes ?? defaultLoadBytes;
    this.log = options.logger ?? logger;
    this.files = options.files ?? SOUND_FILES;
  }

  /** Decode a cue (once, cached). Resolves to null, after one warning, when it cannot be played. */
  decode(name: SoundName): Promise<AudioBufferLike | null> {
    const cached = this.decoded.get(name);
    if (cached) return cached;
    const ctx = this.ctx;
    const url = this.files[name];
    const task = (async (): Promise<AudioBufferLike | null> => {
      if (!ctx) return null;
      try {
        if (!url) throw new Error('not in the registry');
        const bytes = await this.loadBytes(url);
        const buffer = await ctx.decodeAudioData(bytes);
        this.buffers.set(name, buffer);
        return buffer;
      } catch (error) {
        this.warnOnce(name, `cannot load sound "${name}" (${url ?? 'unregistered'})`, error);
        return null;
      }
    })();
    this.decoded.set(name, task);
    return task;
  }

  /** Decode cues ahead of time (a game's cues when it opens). */
  async preload(...names: SoundName[]): Promise<void> {
    await Promise.all(names.map((name) => this.decode(name)));
  }

  /** Play a cue once. Restarts it unless `overlap` is set. */
  play(name: SoundName, options: PlayOptions = {}): void {
    this.request(name, 'once', 0, options.overlap === true);
  }

  /** Start a seamless loop; a no-op if it already loops. */
  loop(name: SoundName): void {
    const running =
      this.voices.some((v) => v.name === name && v.kind === 'loop') ||
      [...this.pending].some((p) => p.name === name && p.kind === 'loop' && !p.cancelled);
    if (!running) this.request(name, 'loop', 0, false);
  }

  stopLoop(name: SoundName): void {
    this.stopWhere((n, kind) => n === name && kind === 'loop');
  }

  /** Start a timed bed, restarting it if it is running; `offsetSec` resumes a clock already in progress. */
  bed(name: SoundName, options: BedOptions = {}): void {
    const offset = options.offsetSec;
    this.request(
      name,
      'bed',
      offset !== undefined && Number.isFinite(offset) ? Math.max(0, offset) : 0,
      false,
    );
  }

  /** Stop every voice of one cue, including a play still decoding. */
  stop(name: SoundName): void {
    this.stopWhere((n) => n === name);
  }

  stopAll(): void {
    this.stopWhere(() => true);
    this.paused = false;
  }

  /** Freeze everything, keeping each voice's position (a paused game clock). */
  pauseAll(): void {
    if (this.paused) return;
    this.paused = true;
    const now = this.now();
    this.voices = this.voices.filter((voice) => {
      if (!voice.source) return true;
      voice.position = this.positionOf(voice, now);
      this.detach(voice);
      return voice.kind === 'loop' || voice.position < voice.buffer.duration;
    });
  }

  /** Continue every frozen voice from where it stopped. */
  resumeAll(): void {
    if (!this.paused) return;
    this.paused = false;
    this.kick();
    for (const voice of this.voices) this.attach(voice, voice.position);
  }

  /** Master volume, 0 to 1. */
  setVolume(volume: number): void {
    if (!Number.isFinite(volume)) return;
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.master) this.master.gain.value = this.volume;
  }

  getVolume(): number {
    return this.volume;
  }

  isPlaying(name: SoundName): boolean {
    return this.voices.some((v) => v.name === name);
  }

  isPaused(): boolean {
    return this.paused;
  }

  // --- internals ----------------------------------------------------------------------------------

  private warnOnce(name: string, message: string, error?: unknown): void {
    if (this.warned.has(name)) return;
    this.warned.add(name);
    this.log.warn(message, error instanceof Error ? error.message : (error ?? ''));
  }

  private now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  private request(name: SoundName, kind: VoiceKind, offset: number, overlap: boolean): void {
    if (!this.ctx) return;
    const buffer = this.buffers.get(name);
    if (buffer) {
      this.begin(name, kind, buffer, offset, overlap);
      return;
    }
    const request: PendingRequest = { name, kind, cancelled: false };
    this.pending.add(request);
    void this.decode(name).then((decoded) => {
      this.pending.delete(request);
      if (decoded && !request.cancelled) this.begin(name, kind, decoded, offset, overlap);
    });
  }

  private begin(
    name: SoundName,
    kind: VoiceKind,
    buffer: AudioBufferLike,
    offset: number,
    overlap: boolean,
  ): void {
    if (!overlap) this.stopWhere((n) => n === name, false);
    // Past the end of a timed bed there is nothing left to play.
    if (kind !== 'loop' && offset >= buffer.duration) return;
    const start = kind === 'loop' && buffer.duration > 0 ? offset % buffer.duration : offset;
    const voice: Voice = { name, kind, buffer, source: null, startedAt: 0, offset: start, position: start };
    this.voices.push(voice);
    if (!this.paused) {
      this.kick();
      this.attach(voice, start);
    }
  }

  /** Browsers start a context suspended until a user gesture; ask again whenever we are about to play. */
  private kick(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'running') return;
    try {
      Promise.resolve(ctx.resume()).catch(() => undefined);
    } catch {
      // Resuming is best effort.
    }
  }

  private outputNode(): GainNodeLike | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (!this.master) {
      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(ctx.destination);
    }
    return this.master;
  }

  private attach(voice: Voice, position: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const output = this.outputNode();
      const source = ctx.createBufferSource();
      source.buffer = voice.buffer;
      source.loop = voice.kind === 'loop';
      if (output) source.connect(output);
      source.onended = () => {
        if (voice.source !== source) return;
        voice.source = null;
        this.voices = this.voices.filter((v) => v !== voice);
      };
      voice.source = source;
      voice.startedAt = ctx.currentTime;
      voice.offset = position;
      source.start(0, position);
    } catch (error) {
      voice.source = null;
      this.voices = this.voices.filter((v) => v !== voice);
      this.warnOnce(voice.name, `cannot play sound "${voice.name}"`, error);
    }
  }

  private detach(voice: Voice): void {
    const source = voice.source;
    voice.source = null;
    if (!source) return;
    source.onended = null;
    try {
      source.stop();
    } catch {
      // Already stopped.
    }
    try {
      source.disconnect();
    } catch {
      // Already disconnected.
    }
  }

  private positionOf(voice: Voice, now: number): number {
    if (!voice.source) return voice.position;
    const raw = voice.offset + Math.max(0, now - voice.startedAt);
    const { duration } = voice.buffer;
    return voice.kind === 'loop' && duration > 0 ? raw % duration : Math.min(raw, duration);
  }

  private stopWhere(match: (name: SoundName, kind: VoiceKind) => boolean, cancelPending = true): void {
    if (cancelPending) {
      for (const request of this.pending) {
        if (match(request.name, request.kind)) request.cancelled = true;
      }
    }
    this.voices = this.voices.filter((voice) => {
      if (!match(voice.name, voice.kind)) return true;
      this.detach(voice);
      return false;
    });
  }
}

// --- Browser wiring ---------------------------------------------------------------------------------

type AudioContextConstructor = new () => AudioContextLike;

const GESTURE_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

/**
 * A player on the real `AudioContext`. With no Web Audio API the player is silent rather than absent, so
 * callers never branch. The context starts suspended in most browsers; the first user gesture resumes it.
 */
export const createBrowserAudioPlayer = (): AudioPlayer => {
  const scope = globalThis as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
  if (!Ctor) {
    logger.warn('Web Audio is not available; sound is off');
    return new AudioPlayer({ context: null });
  }
  let context: AudioContextLike;
  try {
    context = new Ctor();
  } catch (error) {
    logger.warn('cannot start the audio context; sound is off', error);
    return new AudioPlayer({ context: null });
  }

  if (typeof document !== 'undefined') {
    const unlock = (): void => {
      for (const type of GESTURE_EVENTS) document.removeEventListener(type, unlock, true);
      try {
        Promise.resolve(context.resume()).catch(() => undefined);
      } catch {
        // Best effort.
      }
    };
    for (const type of GESTURE_EVENTS) document.addEventListener(type, unlock, true);
  }
  return new AudioPlayer({ context });
};
