import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STAGE_SETTINGS,
  loadStageSettings,
  saveStageSettings,
  SETTINGS_KEYS,
  type StageSettings,
} from './stageSettings';

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
};

describe('stage settings', () => {
  it('uses the defaults when nothing is stored or storage is missing', () => {
    expect(loadStageSettings(memoryStorage())).toEqual(DEFAULT_STAGE_SETTINGS);
    expect(loadStageSettings(null)).toEqual(DEFAULT_STAGE_SETTINGS);
  });

  it('round-trips every setting under its documented key', () => {
    const storage = memoryStorage();
    const settings: StageSettings = {
      showMode: true,
      musicOn: false,
      volume: 0.35,
      crt: true,
      verbose: true,
    };
    saveStageSettings(settings, storage);
    expect(storage.data.get('gst:showMode')).toBe('1');
    expect(storage.data.get(SETTINGS_KEYS.verbose)).toBe('1');
    expect(loadStageSettings(storage)).toEqual(settings);
    saveStageSettings({ ...settings, verbose: false }, storage);
    expect(storage.data.has(SETTINGS_KEYS.verbose)).toBe(false);
  });

  it('clamps a stored volume and ignores garbage', () => {
    expect(loadStageSettings(memoryStorage({ 'gst:volume': '7' })).volume).toBe(1);
    expect(loadStageSettings(memoryStorage({ 'gst:volume': '-2' })).volume).toBe(0);
    expect(loadStageSettings(memoryStorage({ 'gst:volume': 'loud' })).volume).toBe(
      DEFAULT_STAGE_SETTINGS.volume,
    );
  });

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadStageSettings(broken)).toEqual(DEFAULT_STAGE_SETTINGS);
    expect(() => {
      saveStageSettings(DEFAULT_STAGE_SETTINGS, broken);
    }).not.toThrow();
  });
});
