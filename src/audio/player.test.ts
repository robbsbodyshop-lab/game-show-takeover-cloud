import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { AudioPlayer, createBrowserAudioPlayer } from './player.ts';
import type { AudioBufferLike, AudioContextLike, BufferSourceLike, GainNodeLike } from './player.ts';
import { logger } from '../lib/logger.ts';

/** A manual mock source: records start/stop and ends by itself on the (fake) clock. */
class FakeSource implements BufferSourceLike {
  buffer: AudioBufferLike | null = null;
  loop = false;
  onended: ((event?: unknown) => void) | null = null;
  startedAt: number | undefined;
  startOffset: number | undefined;
  stopped = false;
  disconnected = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  connect(): void {
    // The fake has no audio graph.
  }
  disconnect(): void {
    this.disconnected = true;
  }
  start(_when?: number, offset = 0): void {
    this.startOffset = offset;
    this.startedAt = performance.now() / 1000;
    if (!this.loop && this.buffer) {
      this.timer = setTimeout(
        () => {
          this.onended?.();
        },
        (this.buffer.duration - offset) * 1000,
      );
    }
  }
  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
  }
  get active(): boolean {
    return this.startedAt !== undefined && !this.stopped;
  }
}

class FakeContext implements AudioContextLike {
  state = 'running';
  readonly destination = {};
  readonly sources: FakeSource[] = [];
  readonly gain = { value: 1 };
  readonly resume = vi.fn(() => {
    this.state = 'running';
    return Promise.resolve();
  });
  private readonly origin = performance.now();

  get currentTime(): number {
    return (performance.now() - this.origin) / 1000;
  }
  createGain(): GainNodeLike {
    return { gain: this.gain, connect: vi.fn(), disconnect: vi.fn() };
  }
  createBufferSource(): BufferSourceLike {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  /** The fake "file" is an ArrayBuffer whose byte length is the duration in seconds. */
  decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike> {
    return Promise.resolve({ duration: data.byteLength });
  }
  get active(): FakeSource[] {
    return this.sources.filter((s) => s.active);
  }
}

const DURATIONS: Record<string, number> = {
  '/audio/ff_reveal.mp3': 2,
  '/audio/hub_theme.mp3': 10,
  '/audio/ff_fm_clock_20.mp3': 20,
  '/audio/spin_tick.mp3': 1,
};

const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

describe('AudioPlayer', () => {
  let ctx: FakeContext;
  let warn: Mock<(...args: unknown[]) => void>;
  let loadBytes: ReturnType<typeof vi.fn<(url: string) => Promise<ArrayBuffer>>>;
  let player: AudioPlayer;

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = new FakeContext();
    warn = vi.fn<(...args: unknown[]) => void>();
    loadBytes = vi.fn((url: string) => {
      const seconds = DURATIONS[url];
      return seconds === undefined
        ? Promise.reject(new Error('HTTP 404'))
        : Promise.resolve(new ArrayBuffer(seconds));
    });
    player = new AudioPlayer({ context: ctx, loadBytes, logger: { warn } });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('play', () => {
    it('decodes lazily, once, and starts after the decode', async () => {
      player.play('ff_reveal');
      expect(ctx.sources).toHaveLength(0);
      await flush();
      expect(ctx.active).toHaveLength(1);
      player.play('ff_reveal');
      player.play('ff_reveal');
      await flush();
      expect(loadBytes).toHaveBeenCalledTimes(1);
      expect(loadBytes).toHaveBeenCalledWith('/audio/ff_reveal.mp3');
    });

    it('starts synchronously once the cue is decoded', async () => {
      await player.preload('ff_reveal');
      player.play('ff_reveal');
      expect(ctx.active).toHaveLength(1);
    });

    it('restarts a cue instead of stacking it', async () => {
      await player.preload('ff_reveal');
      player.play('ff_reveal');
      const first = ctx.sources[0];
      player.play('ff_reveal');
      expect(first?.stopped).toBe(true);
      expect(ctx.active).toHaveLength(1);
      expect(ctx.sources).toHaveLength(2);
    });

    it('lets a cue overlap itself on request', async () => {
      await player.preload('spin_tick');
      player.play('spin_tick', { overlap: true });
      player.play('spin_tick', { overlap: true });
      player.play('spin_tick', { overlap: true });
      expect(ctx.active).toHaveLength(3);
    });

    it('overlap does not touch other cues, and a plain play leaves other cues alone', async () => {
      await player.preload('spin_tick', 'ff_reveal');
      player.play('spin_tick');
      player.play('ff_reveal');
      expect(ctx.active).toHaveLength(2);
    });

    it('forgets a cue when it ends on its own', async () => {
      await player.preload('ff_reveal');
      player.play('ff_reveal');
      expect(player.isPlaying('ff_reveal')).toBe(true);
      vi.advanceTimersByTime(2000);
      expect(player.isPlaying('ff_reveal')).toBe(false);
    });

    it('resumes a suspended context before playing', async () => {
      ctx.state = 'suspended';
      await player.preload('ff_reveal');
      player.play('ff_reveal');
      expect(ctx.resume).toHaveBeenCalled();
    });
  });

  describe('loop', () => {
    it('loops once however many times it is asked, and stopLoop ends it', async () => {
      await player.preload('hub_theme');
      player.loop('hub_theme');
      player.loop('hub_theme');
      expect(ctx.sources).toHaveLength(1);
      expect(ctx.sources[0]?.loop).toBe(true);
      vi.advanceTimersByTime(60_000);
      expect(player.isPlaying('hub_theme')).toBe(true);
      player.stopLoop('hub_theme');
      expect(ctx.active).toHaveLength(0);
      expect(player.isPlaying('hub_theme')).toBe(false);
    });

    it('asking twice before the decode finishes still starts one loop', async () => {
      player.loop('hub_theme');
      player.loop('hub_theme');
      await flush();
      expect(ctx.active).toHaveLength(1);
    });

    it('stopLoop before the decode finishes cancels the loop', async () => {
      player.loop('hub_theme');
      player.stopLoop('hub_theme');
      await flush();
      expect(ctx.sources).toHaveLength(0);
    });

    it('stopLoop leaves a one-shot of the same cue alone', async () => {
      await player.preload('hub_theme');
      player.play('hub_theme');
      player.stopLoop('hub_theme');
      expect(ctx.active).toHaveLength(1);
    });
  });

  describe('bed', () => {
    it('starts at an offset when the clock was already running', async () => {
      await player.preload('ff_fm_clock_20');
      player.bed('ff_fm_clock_20', { offsetSec: 7.5 });
      expect(ctx.sources[0]?.startOffset).toBe(7.5);
      expect(ctx.sources[0]?.loop).toBe(false);
    });

    it('restarts from the top when asked again, and ignores an offset past the end', async () => {
      await player.preload('ff_fm_clock_20');
      player.bed('ff_fm_clock_20');
      player.bed('ff_fm_clock_20');
      expect(ctx.sources[0]?.stopped).toBe(true);
      expect(ctx.active).toHaveLength(1);
      player.bed('ff_fm_clock_20', { offsetSec: 25 });
      expect(ctx.active).toHaveLength(0);
    });

    it('treats a negative or NaN offset as zero', async () => {
      await player.preload('ff_fm_clock_20');
      player.bed('ff_fm_clock_20', { offsetSec: -3 });
      expect(ctx.sources[0]?.startOffset).toBe(0);
      player.bed('ff_fm_clock_20', { offsetSec: Number.NaN });
      expect(ctx.sources[1]?.startOffset).toBe(0);
    });

    it('ends by itself when the clock would read 0', async () => {
      await player.preload('ff_fm_clock_20');
      player.bed('ff_fm_clock_20');
      vi.advanceTimersByTime(19_999);
      expect(player.isPlaying('ff_fm_clock_20')).toBe(true);
      vi.advanceTimersByTime(1);
      expect(player.isPlaying('ff_fm_clock_20')).toBe(false);
    });
  });

  describe('pauseAll / resumeAll', () => {
    it('keeps a bed in step with a paused clock', async () => {
      await player.preload('ff_fm_clock_20');
      player.bed('ff_fm_clock_20');
      vi.advanceTimersByTime(7000);
      player.pauseAll();
      expect(ctx.active).toHaveLength(0);
      expect(player.isPaused()).toBe(true);
      vi.advanceTimersByTime(30_000);
      player.resumeAll();
      expect(ctx.sources).toHaveLength(2);
      expect(ctx.sources[1]?.startOffset).toBeCloseTo(7, 5);
      vi.advanceTimersByTime(3000);
      player.pauseAll();
      player.resumeAll();
      expect(ctx.sources[2]?.startOffset).toBeCloseTo(10, 5);
      vi.advanceTimersByTime(10_000);
      expect(player.isPlaying('ff_fm_clock_20')).toBe(false);
    });

    it('wraps a loop around its length', async () => {
      await player.preload('hub_theme');
      player.loop('hub_theme');
      vi.advanceTimersByTime(25_000);
      player.pauseAll();
      player.resumeAll();
      expect(ctx.sources[1]?.startOffset).toBeCloseTo(5, 5);
      expect(ctx.sources[1]?.loop).toBe(true);
    });

    it('pauses and resumes several voices independently', async () => {
      await player.preload('hub_theme', 'ff_fm_clock_20');
      player.loop('hub_theme');
      vi.advanceTimersByTime(2000);
      player.bed('ff_fm_clock_20');
      vi.advanceTimersByTime(3000);
      player.pauseAll();
      player.resumeAll();
      const offsets = ctx.sources.slice(2).map((s) => s.startOffset);
      expect(offsets[0]).toBeCloseTo(5, 5);
      expect(offsets[1]).toBeCloseTo(3, 5);
    });

    it('is idempotent', async () => {
      await player.preload('ff_fm_clock_20');
      player.bed('ff_fm_clock_20');
      vi.advanceTimersByTime(1000);
      player.pauseAll();
      player.pauseAll();
      player.resumeAll();
      player.resumeAll();
      expect(ctx.sources).toHaveLength(2);
    });

    it('holds a cue started while paused until resume', async () => {
      await player.preload('ff_reveal');
      player.pauseAll();
      player.play('ff_reveal');
      expect(ctx.active).toHaveLength(0);
      player.resumeAll();
      expect(ctx.active).toHaveLength(1);
      expect(ctx.sources[0]?.startOffset).toBe(0);
    });

    it('stopAll while paused clears the held voices and the pause', async () => {
      await player.preload('ff_fm_clock_20');
      player.bed('ff_fm_clock_20');
      player.pauseAll();
      player.stopAll();
      player.resumeAll();
      expect(ctx.active).toHaveLength(0);
      expect(player.isPaused()).toBe(false);
    });
  });

  describe('stop / stopAll', () => {
    it('stop ends every voice of one cue and leaves others', async () => {
      await player.preload('spin_tick', 'hub_theme');
      player.play('spin_tick', { overlap: true });
      player.play('spin_tick', { overlap: true });
      player.loop('hub_theme');
      player.stop('spin_tick');
      expect(ctx.active).toHaveLength(1);
      expect(player.isPlaying('hub_theme')).toBe(true);
    });

    it('stopAll silences loops, beds and one-shots and cancels plays still decoding', async () => {
      await player.preload('hub_theme', 'ff_fm_clock_20', 'ff_reveal');
      player.loop('hub_theme');
      player.bed('ff_fm_clock_20');
      player.play('ff_reveal');
      player.play('spin_tick');
      player.stopAll();
      await flush();
      expect(ctx.active).toHaveLength(0);
      expect(player.isPlaying('hub_theme')).toBe(false);
    });

    it('can play again after stopAll', async () => {
      await player.preload('ff_reveal');
      player.play('ff_reveal');
      player.stopAll();
      player.play('ff_reveal');
      expect(ctx.active).toHaveLength(1);
    });
  });

  describe('setVolume', () => {
    it('clamps to 0..1 and ignores NaN', async () => {
      await player.preload('ff_reveal');
      player.play('ff_reveal');
      player.setVolume(0.4);
      expect(ctx.gain.value).toBe(0.4);
      player.setVolume(5);
      expect(ctx.gain.value).toBe(1);
      player.setVolume(-1);
      expect(ctx.gain.value).toBe(0);
      player.setVolume(Number.NaN);
      expect(player.getVolume()).toBe(0);
    });

    it('applies a volume set before the first sound', async () => {
      player.setVolume(0.25);
      await player.preload('ff_reveal');
      player.play('ff_reveal');
      expect(ctx.gain.value).toBe(0.25);
    });
  });

  describe('failures never throw', () => {
    it('warns once per cue for a missing file', async () => {
      player.play('alarm');
      player.play('alarm');
      player.loop('alarm');
      player.bed('alarm');
      await flush();
      player.play('alarm');
      await flush();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toContain('alarm');
      expect(loadBytes).toHaveBeenCalledTimes(1);
      expect(ctx.sources).toHaveLength(0);
    });

    it('warns separately for each missing cue', async () => {
      player.play('alarm');
      player.play('applause');
      await flush();
      expect(warn).toHaveBeenCalledTimes(2);
    });

    it('survives a decode failure', async () => {
      ctx.decodeAudioData = () => Promise.reject(new Error('bad data'));
      player.play('ff_reveal');
      await flush();
      player.play('ff_reveal');
      await flush();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(ctx.sources).toHaveLength(0);
    });

    it('survives a source that throws on start', async () => {
      await player.preload('ff_reveal');
      ctx.createBufferSource = () => {
        const source = new FakeSource();
        source.start = () => {
          throw new Error('InvalidStateError');
        };
        return source;
      };
      expect(() => {
        player.play('ff_reveal');
        player.play('ff_reveal');
      }).not.toThrow();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(player.isPlaying('ff_reveal')).toBe(false);
    });

    it('survives a context whose resume throws', async () => {
      ctx.state = 'suspended';
      ctx.resume.mockImplementation(() => {
        throw new Error('nope');
      });
      await player.preload('ff_reveal');
      expect(() => {
        player.play('ff_reveal');
      }).not.toThrow();
    });

    it('is silent with no audio context', () => {
      const silent = new AudioPlayer({ context: null, logger: { warn } });
      expect(() => {
        silent.play('ff_reveal');
        silent.loop('hub_theme');
        silent.bed('ff_fm_clock_20', { offsetSec: 3 });
        silent.pauseAll();
        silent.resumeAll();
        silent.stop('ff_reveal');
        silent.stopLoop('hub_theme');
        silent.setVolume(0.5);
        silent.stopAll();
      }).not.toThrow();
    });
  });
});

describe('createBrowserAudioPlayer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns a silent player when Web Audio is missing', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const player = createBrowserAudioPlayer();
    expect(() => {
      player.play('ff_reveal');
      player.loop('hub_theme');
    }).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('returns a silent player when the context cannot be built', () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        readonly state = 'blocked';
        constructor() {
          throw new Error('blocked');
        }
      },
    );
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    expect(() => {
      createBrowserAudioPlayer().play('ff_reveal');
    }).not.toThrow();
  });

  it('resumes the context on the first user gesture, once', () => {
    const resume = vi.fn(() => Promise.resolve());
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'suspended';
        resume = resume;
      },
    );
    createBrowserAudioPlayer();
    expect(resume).not.toHaveBeenCalled();
    document.dispatchEvent(new Event('pointerdown'));
    document.dispatchEvent(new Event('keydown'));
    document.dispatchEvent(new Event('pointerdown'));
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('falls back to webkitAudioContext', () => {
    const resume = vi.fn(() => Promise.resolve());
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal(
      'webkitAudioContext',
      class {
        resume = resume;
      },
    );
    createBrowserAudioPlayer();
    document.dispatchEvent(new Event('touchstart'));
    expect(resume).toHaveBeenCalledTimes(1);
  });
});
