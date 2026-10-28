import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LOOPING_BEDS,
  SOUND_FILES,
  SOUND_NAMES,
  TIMED_BED_SECONDS,
  UNUSED_CUES,
  isSoundName,
} from './cues.ts';

const root = process.cwd();
const audioDir = join(root, 'public', 'audio');

describe('cue registry', () => {
  it('maps every cue to /audio/<file>.mp3', () => {
    for (const name of SOUND_NAMES) expect(SOUND_FILES[name]).toMatch(/^\/audio\/[a-z0-9_]+\.mp3$/);
  });

  it('points only at files that exist under public/audio', () => {
    for (const name of SOUND_NAMES) {
      const file = join(root, 'public', SOUND_FILES[name]);
      expect(existsSync(file), `${name} -> ${file}`).toBe(true);
    }
  });

  it('registers every mp3 in public/audio, once', () => {
    const files = readdirSync(audioDir).filter((f) => f.endsWith('.mp3'));
    const registered = SOUND_NAMES.map((n) => SOUND_FILES[n].replace('/audio/', ''));
    expect(new Set(registered).size).toBe(registered.length);
    expect([...registered].sort()).toEqual([...files].sort());
    expect(SOUND_NAMES).toHaveLength(64);
  });

  it('lists every cue named in docs/reference/AUDIO_CUES_V1.md with its file', () => {
    const doc = readFileSync(join(root, 'docs', 'reference', 'AUDIO_CUES_V1.md'), 'utf8');
    const rows = [...doc.matchAll(/^\| `([a-z0-9_]+)`\s*\| `([a-z0-9_]+\.mp3)`/gm)];
    expect(rows.length).toBe(SOUND_NAMES.length);
    for (const [, name, file] of rows) {
      expect(isSoundName(name ?? '')).toBe(true);
      expect(SOUND_FILES[name as keyof typeof SOUND_FILES]).toBe(`/audio/${file}`);
    }
  });

  it('keeps the registered-but-not-played cues, including renamed files', () => {
    expect(UNUSED_CUES).toHaveLength(9);
    expect(SOUND_FILES.ff_round_start).toBe('/audio/family_feud_intro.mp3');
    expect(SOUND_FILES.ff_steal_success).toBe('/audio/steal_success.mp3');
  });

  it('declares the timed beds and loops', () => {
    expect(TIMED_BED_SECONDS).toEqual({
      ff_fm_clock_20: 20,
      ff_fm_clock_25: 25,
      wof_frenzy_bed: 30,
      wof_bonus_clock_10: 10,
      wof_envelope: 3,
    });
    expect([...LOOPING_BEDS]).toEqual(['hub_theme', 'countdown_theme', 'wof_tossup_bed', 'wof_express_bed']);
    for (const name of [...LOOPING_BEDS, ...Object.keys(TIMED_BED_SECONDS)])
      expect(isSoundName(name)).toBe(true);
  });

  it('rejects unknown names', () => {
    expect(isSoundName('nope')).toBe(false);
    expect(isSoundName('toString')).toBe(false);
  });
});
