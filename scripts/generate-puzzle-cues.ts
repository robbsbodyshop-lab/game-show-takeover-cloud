/**
 * Synthesises the puzzle game's cues (design.md section 10, TD-005): short original chiptune sounds
 * built from square, triangle and noise voices, written as 22.05 kHz mono 8-bit PCM WAV files into
 * `public/audio/puzzle/`. No dependencies and no encoder; the output is deterministic, so running it
 * twice gives identical bytes.
 *
 * Run (Node 22, no install needed):
 *   node --experimental-strip-types scripts/generate-puzzle-cues.ts
 *
 * 8-bit samples keep every effect under 50 KB (about 2.2 s at this rate). The two 8-bar music loops
 * are longer than that by nature (about 280 KB and 390 KB) and are the only exceptions.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SAMPLE_RATE = 22050;
export const SFX_MAX_BYTES = 50 * 1024;
export const MUSIC_MAX_BYTES = 400 * 1024;

type Wave = 'square' | 'triangle' | 'noise';

interface Note {
  /** Start time in seconds. */
  t: number;
  dur: number;
  /** Hz (for noise: how fast the shift register is clocked). */
  freq: number;
  /** Optional glide target, exponential in time. */
  freqEnd?: number;
  wave: Wave;
  /** Square duty cycle, 0..1. */
  duty?: number;
  vol: number;
  /** Decay time constant in seconds; defaults to a third of the note. */
  tau?: number;
}

const hz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

// --- Voice rendering -------------------------------------------------------------------------------

const renderNote = (out: Float32Array, note: Note): void => {
  const start = Math.round(note.t * SAMPLE_RATE);
  const length = Math.max(1, Math.round(note.dur * SAMPLE_RATE));
  const tau = note.tau ?? note.dur / 3;
  const attack = 0.002;
  const release = Math.min(0.006, note.dur / 3);
  const duty = note.duty ?? 0.5;
  let phase = 0;
  let lfsr = 1;
  let noiseHold = 0;
  let noiseValue = 1;
  for (let i = 0; i < length; i++) {
    const index = start + i;
    if (index < 0 || index >= out.length) continue;
    const t = i / SAMPLE_RATE;
    const u = i / length;
    const f =
      note.freqEnd !== undefined && note.freqEnd > 0 && note.freq > 0
        ? note.freq * Math.pow(note.freqEnd / note.freq, u)
        : note.freq;
    let sample: number;
    if (note.wave === 'noise') {
      noiseHold -= 1;
      if (noiseHold <= 0) {
        const bit = (lfsr ^ (lfsr >> 1)) & 1;
        lfsr = (lfsr >> 1) | (bit << 14);
        noiseValue = (lfsr & 1) === 1 ? 1 : -1;
        noiseHold = Math.max(1, SAMPLE_RATE / Math.max(1, f));
      }
      sample = noiseValue;
    } else {
      phase += f / SAMPLE_RATE;
      phase -= Math.floor(phase);
      sample = note.wave === 'square' ? (phase < duty ? 1 : -1) : 4 * Math.abs(phase - 0.5) - 1;
    }
    const envIn = Math.min(1, t / attack);
    const envOut = Math.min(1, (note.dur - t) / release);
    const env = Math.max(0, Math.min(envIn, envOut)) * Math.exp(-t / tau);
    out[index] = (out[index] ?? 0) + sample * env * note.vol;
  }
};

const mix = (notes: readonly Note[], seconds: number, peak: number): Float32Array => {
  const out = new Float32Array(Math.round(seconds * SAMPLE_RATE));
  for (const note of notes) renderNote(out, note);
  let max = 0;
  for (const v of out) max = Math.max(max, Math.abs(v));
  if (max > 0) {
    const gain = peak / max;
    for (let i = 0; i < out.length; i++) out[i] = (out[i] ?? 0) * gain;
  }
  return out;
};

// --- WAV container ---------------------------------------------------------------------------------

export const encodeWav = (samples: Float32Array): Uint8Array => {
  const dataBytes = samples.length;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  const tag = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  tag(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE, true); // byte rate = rate x 1 byte
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample
  tag(36, 'data');
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i] ?? 0));
    bytes[44 + i] = Math.round(128 + v * 127);
  }
  return bytes;
};

// --- Effects ---------------------------------------------------------------------------------------

const sq = (t: number, dur: number, midi: number, vol = 1, duty = 0.5, tau?: number): Note => ({
  t,
  dur,
  freq: hz(midi),
  wave: 'square',
  duty,
  vol,
  ...(tau !== undefined ? { tau } : {}),
});

const tri = (t: number, dur: number, midi: number, vol = 1, tau?: number): Note => ({
  t,
  dur,
  freq: hz(midi),
  wave: 'triangle',
  vol,
  ...(tau !== undefined ? { tau } : {}),
});

const noise = (t: number, dur: number, rate: number, vol: number, rateEnd?: number): Note => ({
  t,
  dur,
  freq: rate,
  ...(rateEnd !== undefined ? { freqEnd: rateEnd } : {}),
  wave: 'noise',
  vol,
  tau: dur / 3,
});

const run = (t0: number, step: number, midis: readonly number[], len: number, vol = 1, duty = 0.5): Note[] =>
  midis.map((m, i) => sq(t0 + i * step, len, m, vol, duty));

const cascade = (k: number): Note[] => {
  const base = 64 + k * 2;
  return [
    ...run(0, 0.05, [base, base + 4, base + 7, base + 12], 0.09, 0.8, 0.25),
    tri(0.2, 0.16, base + 12, 0.9, 0.08),
    noise(0.2, 0.06, 6000, 0.25),
  ];
};

interface Cue {
  name: string;
  seconds: number;
  peak: number;
  notes: Note[];
}

const effects = (): Cue[] => [
  { name: 'puzzle-move', seconds: 0.05, peak: 0.45, notes: [sq(0, 0.045, 76, 1, 0.5, 0.02)] },
  {
    name: 'puzzle-rotate',
    seconds: 0.12,
    peak: 0.55,
    notes: [sq(0, 0.05, 79, 1, 0.25, 0.04), sq(0.05, 0.07, 86, 1, 0.25, 0.05)],
  },
  {
    name: 'puzzle-lock',
    seconds: 0.2,
    peak: 0.8,
    notes: [
      { t: 0, dur: 0.15, freq: 150, freqEnd: 55, wave: 'triangle', vol: 1, tau: 0.06 },
      noise(0, 0.05, 9000, 0.35),
    ],
  },
  {
    name: 'puzzle-fall',
    seconds: 0.1,
    peak: 0.5,
    notes: [{ t: 0, dur: 0.09, freq: 700, freqEnd: 330, wave: 'square', duty: 0.25, vol: 1, tau: 0.05 }],
  },
  {
    name: 'puzzle-clear',
    seconds: 0.32,
    peak: 0.75,
    notes: [
      ...run(0, 0.055, [72, 76, 79, 84], 0.1, 1, 0.5),
      noise(0, 0.04, 8000, 0.3),
      tri(0.05, 0.25, 60, 0.7),
    ],
  },
  {
    name: 'puzzle-germ-clear',
    seconds: 0.5,
    peak: 0.8,
    notes: [
      noise(0, 0.07, 7000, 0.45, 2500),
      ...run(0.03, 0.05, [72, 76, 79, 84, 88], 0.1, 0.9, 0.25),
      sq(0.3, 0.2, 91, 0.8, 0.25, 0.1),
      tri(0.03, 0.4, 48, 0.8, 0.2),
    ],
  },
  ...[1, 2, 3, 4].map((k): Cue => ({
    name: `puzzle-cascade-${k.toString()}`,
    seconds: 0.4,
    peak: 0.8,
    notes: cascade(k),
  })),
  {
    name: 'puzzle-garbage-send',
    seconds: 0.4,
    peak: 0.75,
    notes: [
      { t: 0, dur: 0.35, freq: 900, freqEnd: 180, wave: 'square', duty: 0.125, vol: 0.9, tau: 0.2 },
      noise(0, 0.3, 9000, 0.35, 1500),
    ],
  },
  {
    name: 'puzzle-garbage-land',
    seconds: 0.35,
    peak: 0.85,
    notes: [
      { t: 0, dur: 0.3, freq: 110, freqEnd: 40, wave: 'triangle', vol: 1, tau: 0.12 },
      noise(0, 0.12, 4000, 0.45, 800),
      sq(0.12, 0.1, 43, 0.4, 0.125, 0.05),
    ],
  },
  {
    name: 'puzzle-top-out',
    seconds: 1.0,
    peak: 0.75,
    notes: [
      ...[69, 65, 62, 57].map((m, i) => sq(i * 0.16, 0.15, m, 0.9, 0.25, 0.1)),
      { t: 0.64, dur: 0.34, freq: hz(57), freqEnd: hz(45), wave: 'triangle', vol: 1, tau: 0.3 },
      noise(0.64, 0.25, 2500, 0.25, 500),
    ],
  },
  {
    name: 'puzzle-round-win',
    seconds: 1.0,
    peak: 0.75,
    notes: [
      ...run(0, 0.11, [72, 76, 79], 0.1, 0.9, 0.25),
      sq(0.33, 0.6, 84, 0.9, 0.25, 0.4),
      sq(0.33, 0.6, 76, 0.5, 0.5, 0.4),
      tri(0.33, 0.6, 60, 0.9, 0.4),
    ],
  },
  {
    name: 'puzzle-match-win',
    seconds: 2.0,
    peak: 0.8,
    notes: [
      ...[72, 72, 72].map((m, i) => sq(i * 0.12, 0.1, m, 0.9, 0.25)),
      sq(0.4, 0.3, 76, 0.9, 0.25, 0.25),
      sq(0.7, 0.12, 74, 0.9, 0.25),
      sq(0.82, 0.12, 76, 0.9, 0.25),
      sq(0.94, 0.12, 79, 0.9, 0.25),
      sq(1.1, 0.8, 84, 0.9, 0.25, 0.5),
      sq(1.1, 0.8, 79, 0.5, 0.5, 0.5),
      sq(1.1, 0.8, 76, 0.5, 0.5, 0.5),
      tri(0, 0.38, 48, 0.9),
      tri(0.4, 0.28, 52, 0.9),
      tri(0.7, 0.38, 55, 0.9),
      tri(1.1, 0.85, 48, 1, 0.6),
    ],
  },
  {
    name: 'puzzle-level-clear',
    seconds: 1.5,
    peak: 0.8,
    notes: [
      ...run(0, 0.075, [60, 64, 67, 72, 76, 79, 84, 88], 0.09, 0.85, 0.25),
      sq(0.65, 0.8, 91, 0.9, 0.25, 0.45),
      sq(0.65, 0.8, 84, 0.5, 0.5, 0.45),
      sq(0.65, 0.8, 79, 0.5, 0.5, 0.45),
      tri(0.65, 0.8, 48, 1, 0.5),
      noise(0.65, 0.05, 9000, 0.3),
    ],
  },
  {
    name: 'puzzle-game-over',
    seconds: 2.0,
    peak: 0.75,
    notes: [
      ...[67, 64, 60, 55].map((m, i) => sq(i * 0.28, 0.26, m, 0.9, 0.5, 0.15)),
      { t: 1.12, dur: 0.85, freq: hz(55), freqEnd: hz(36), wave: 'square', duty: 0.25, vol: 0.9, tau: 0.5 },
      tri(0, 1.1, 43, 0.9, 0.5),
      tri(1.12, 0.85, 31, 1, 0.5),
    ],
  },
  {
    name: 'puzzle-pause',
    seconds: 0.25,
    peak: 0.6,
    notes: [sq(0, 0.1, 81, 1, 0.5, 0.06), sq(0.11, 0.13, 69, 1, 0.5, 0.08)],
  },
  {
    name: 'puzzle-resume',
    seconds: 0.25,
    peak: 0.6,
    notes: [sq(0, 0.1, 69, 1, 0.5, 0.06), sq(0.11, 0.13, 81, 1, 0.5, 0.08)],
  },
  { name: 'puzzle-hover', seconds: 0.05, peak: 0.35, notes: [sq(0, 0.04, 88, 1, 0.25, 0.02)] },
  {
    name: 'puzzle-select',
    seconds: 0.2,
    peak: 0.6,
    notes: [sq(0, 0.07, 79, 1, 0.25, 0.05), sq(0.07, 0.12, 86, 1, 0.25, 0.08)],
  },
];

// --- Music -----------------------------------------------------------------------------------------

interface Track {
  name: string;
  bpm: number;
  bars: number;
  peak: number;
  notes: Note[];
}

const BEATS_PER_BAR = 4;

/** 0 is a rest, null holds the previous note, any other value is a MIDI note. */
type Step = number | null;

const eighths = (
  notes: Note[],
  barStart: number,
  eighth: number,
  steps: readonly Step[],
  make: (midi: number, dur: number) => Note,
): void => {
  const held: { cur: { midi: number; at: number; len: number } | null } = { cur: null };
  const flush = (): void => {
    const cur = held.cur;
    if (cur) notes.push({ ...make(cur.midi, cur.len * eighth * 0.96), t: barStart + cur.at * eighth });
    held.cur = null;
  };
  steps.forEach((step, i) => {
    if (step === null) {
      if (held.cur) held.cur.len += 1;
      return;
    }
    flush();
    if (step > 0) held.cur = { midi: step, at: i, len: 1 };
  });
  flush();
};

const upbeatTrack = (): Track => {
  const bpm = 152;
  const eighth = 60 / bpm / 2;
  const bar = eighth * 8;
  const melody: Step[][] = [
    [76, 79, 84, 79, 76, 79, 72, 76],
    [74, 79, 83, 79, 74, 79, 71, 74],
    [72, 76, 81, 76, 72, 76, 69, 72],
    [72, 77, 81, 77, 72, 77, 69, 72],
    [76, 79, 84, 86, 84, 79, 76, 79],
    [74, 79, 83, 86, 83, 79, 74, 71],
    [72, 77, 81, 84, 81, 77, 72, 77],
    [74, 77, 79, 83, 86, 83, 79, 74],
  ];
  const roots = [36, 31, 33, 29, 36, 31, 29, 31];
  const harmony: number[][] = [
    [64, 67],
    [62, 67],
    [60, 64],
    [60, 65],
    [64, 67],
    [62, 67],
    [60, 65],
    [62, 67],
  ];
  const notes: Note[] = [];
  melody.forEach((steps, b) => {
    const start = b * bar;
    eighths(notes, start, eighth, steps, (m, d) => sq(0, d, m, 0.55, 0.25, d * 0.7));
    const root = roots[b] ?? 36;
    const bassPattern = [0, 12, 0, 12, 0, 12, 7, 12];
    bassPattern.forEach((off, i) =>
      notes.push(tri(start + i * eighth, eighth * 0.9, root + off, 0.9, eighth * 1.2)),
    );
    const pair = harmony[b] ?? [64, 67];
    for (const m of pair) notes.push(sq(start, bar * 0.5, m, 0.12, 0.5, bar * 0.4));
    for (let beat = 0; beat < BEATS_PER_BAR; beat++) {
      const t = start + beat * eighth * 2;
      if (beat % 2 === 0) {
        notes.push({ t, dur: 0.11, freq: 160, freqEnd: 45, wave: 'triangle', vol: 1, tau: 0.05 });
      } else {
        notes.push(noise(t, 0.09, 7000, 0.4, 3000));
      }
      notes.push(noise(t + eighth, 0.03, 12000, 0.14));
    }
    if (b === 7)
      notes.push(noise(start + 6 * eighth, 0.07, 6000, 0.35), noise(start + 7 * eighth, 0.07, 6000, 0.4));
  });
  return { name: 'puzzle-music-a', bpm, bars: 8, peak: 0.5, notes };
};

const chillTrack = (): Track => {
  const bpm = 108;
  const eighth = 60 / bpm / 2;
  const bar = eighth * 8;
  const melody: Step[][] = [
    [76, null, 72, null, 74, null, 69, null],
    [72, null, 77, null, 76, null, 72, null],
    [79, null, 76, null, 72, null, 76, null],
    [74, null, 79, null, 83, null, 79, null],
    [81, null, null, null, 79, null, 76, null],
    [77, null, 81, null, 77, null, 72, null],
    [76, null, 80, null, 83, null, 80, null],
    [81, null, null, null, null, null, 0, 0],
  ];
  // chord tones (root, third, fifth) and bass roots per bar: Am F C G Am F E Am
  const chords: number[][] = [
    [57, 60, 64],
    [53, 57, 60],
    [48, 52, 55],
    [55, 59, 62],
    [57, 60, 64],
    [53, 57, 60],
    [52, 56, 59],
    [57, 60, 64],
  ];
  const roots = [45, 41, 36, 43, 45, 41, 40, 45];
  const notes: Note[] = [];
  melody.forEach((steps, b) => {
    const start = b * bar;
    eighths(notes, start, eighth, steps, (m, d) => tri(0, d, m, 1, d * 0.8));
    const chord = chords[b] ?? [57, 60, 64];
    for (let i = 0; i < 8; i++) {
      const m = chord[[0, 1, 2, 1][i % 4] ?? 0] ?? 57;
      notes.push(sq(start + i * eighth, eighth * 0.8, m + 12, 0.14, 0.125, eighth * 0.6));
    }
    const root = roots[b] ?? 45;
    notes.push(tri(start, bar * 0.48, root, 0.9, bar * 0.4));
    notes.push(tri(start + bar * 0.5, bar * 0.46, root + 7, 0.8, bar * 0.3));
    notes.push({ t: start, dur: 0.14, freq: 140, freqEnd: 45, wave: 'triangle', vol: 0.9, tau: 0.06 });
    notes.push(noise(start + bar * 0.5, 0.1, 5000, 0.18, 2500));
    for (let i = 0; i < 8; i++) notes.push(noise(start + i * eighth, 0.025, 12000, i % 2 === 0 ? 0.1 : 0.06));
  });
  return { name: 'puzzle-music-b', bpm, bars: 8, peak: 0.45, notes };
};

const trackSeconds = (track: Track): number => track.bars * BEATS_PER_BAR * (60 / track.bpm);

// --- Entry points ----------------------------------------------------------------------------------

/** Every cue as WAV bytes, keyed by cue name (also the file name without `.wav`). */
export const buildAllCues = (): Map<string, Uint8Array> => {
  const out = new Map<string, Uint8Array>();
  for (const cue of effects()) out.set(cue.name, encodeWav(mix(cue.notes, cue.seconds, cue.peak)));
  for (const track of [upbeatTrack(), chillTrack()]) {
    out.set(track.name, encodeWav(mix(track.notes, trackSeconds(track), track.peak)));
  }
  return out;
};

const main = (): void => {
  const dir = join(import.meta.dirname, '..', 'public', 'audio', 'puzzle');
  mkdirSync(dir, { recursive: true });
  let total = 0;
  for (const [name, bytes] of buildAllCues()) {
    writeFileSync(join(dir, `${name}.wav`), bytes);
    total += bytes.length;
    process.stdout.write(`${name}.wav  ${(bytes.length / 1024).toFixed(1)} KB\n`);
  }
  process.stdout.write(`wrote ${dir} (${(total / 1024).toFixed(0)} KB)\n`);
};

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) main();
