import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MUSIC_MAX_BYTES,
  SAMPLE_RATE,
  SFX_MAX_BYTES,
  buildAllCues,
} from '../../../scripts/generate-puzzle-cues';
import { PUZZLE_CUE_NAMES, PUZZLE_MUSIC_CUES, PUZZLE_SFX_CUES, PUZZLE_SOUND_FILES, cascadeCue } from './cues';

const root = process.cwd();
const audioDir = join(root, 'public', 'audio', 'puzzle');

describe('puzzle cue registry', () => {
  it('has the required cues', () => {
    for (const name of [
      'puzzle-move',
      'puzzle-rotate',
      'puzzle-lock',
      'puzzle-fall',
      'puzzle-clear',
      'puzzle-germ-clear',
      'puzzle-cascade-1',
      'puzzle-cascade-4',
      'puzzle-garbage-send',
      'puzzle-garbage-land',
      'puzzle-top-out',
      'puzzle-round-win',
      'puzzle-match-win',
      'puzzle-level-clear',
      'puzzle-game-over',
      'puzzle-pause',
      'puzzle-resume',
      'puzzle-hover',
      'puzzle-select',
      'puzzle-music-a',
      'puzzle-music-b',
    ]) {
      expect(PUZZLE_CUE_NAMES).toContain(name);
    }
    expect(new Set(PUZZLE_CUE_NAMES).size).toBe(PUZZLE_CUE_NAMES.length);
  });

  it('maps every cue to /audio/puzzle/<name>.wav', () => {
    for (const name of PUZZLE_CUE_NAMES) expect(PUZZLE_SOUND_FILES[name]).toBe(`/audio/puzzle/${name}.wav`);
  });

  it('has a file on disk for every cue', () => {
    for (const name of PUZZLE_CUE_NAMES) {
      const file = join(root, 'public', PUZZLE_SOUND_FILES[name]);
      expect(existsSync(file), `${name} -> ${file}`).toBe(true);
    }
  });

  it('has no stray wav in the puzzle folder', () => {
    const files = readdirSync(audioDir).filter((f) => f.endsWith('.wav'));
    expect([...files].sort()).toEqual(PUZZLE_CUE_NAMES.map((n) => `${n}.wav`).sort());
  });

  it('keeps effects under 50 KB and loops under 400 KB', () => {
    for (const name of PUZZLE_SFX_CUES) {
      expect(statSync(join(audioDir, `${name}.wav`)).size, name).toBeLessThan(SFX_MAX_BYTES);
    }
    for (const name of PUZZLE_MUSIC_CUES) {
      expect(statSync(join(audioDir, `${name}.wav`)).size, name).toBeLessThan(MUSIC_MAX_BYTES);
    }
  });

  it('writes 22.05 kHz mono PCM WAV files', () => {
    for (const name of PUZZLE_CUE_NAMES) {
      const bytes = readFileSync(join(audioDir, `${name}.wav`));
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      expect(bytes.toString('ascii', 0, 4), name).toBe('RIFF');
      expect(bytes.toString('ascii', 8, 12), name).toBe('WAVE');
      expect(view.getUint16(20, true), `${name} PCM`).toBe(1);
      expect(view.getUint16(22, true), `${name} mono`).toBe(1);
      expect(view.getUint32(24, true), `${name} rate`).toBe(SAMPLE_RATE);
      expect(view.getUint32(40, true), `${name} data length`).toBe(bytes.length - 44);
    }
  });

  it('matches what the generator script produces (the files are not stale)', () => {
    const built = buildAllCues();
    expect([...built.keys()].sort()).toEqual([...PUZZLE_CUE_NAMES].sort());
    for (const [name, data] of built) {
      const onDisk = readFileSync(join(audioDir, `${name}.wav`));
      expect(Buffer.compare(onDisk, Buffer.from(data)), name).toBe(0);
    }
  });

  it('raises the cascade cue with the chain index and caps at 4', () => {
    expect(cascadeCue(1)).toBe('puzzle-cascade-1');
    expect(cascadeCue(3)).toBe('puzzle-cascade-3');
    expect(cascadeCue(9)).toBe('puzzle-cascade-4');
    expect(cascadeCue(0)).toBe('puzzle-cascade-1');
  });
});
