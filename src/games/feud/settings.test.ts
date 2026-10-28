import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FEUD_SETTINGS,
  feudSettingsSchema,
  parseFeudSettings,
  resolveFeudSettings,
  toEngineSettings,
} from './settings';

describe('FeudSettings', () => {
  it('has the documented defaults', () => {
    expect(DEFAULT_FEUD_SETTINGS).toEqual({
      targetScore: 300,
      format: 'full',
      fastMoneyEnabled: true,
      answerTimerSec: 5,
      stealTimerSec: 0,
      voice: 'off',
      answersFrom: 'host',
    });
    expect(feudSettingsSchema.safeParse(DEFAULT_FEUD_SETTINGS).success).toBe(true);
  });

  it('rejects values outside the choices', () => {
    expect(feudSettingsSchema.safeParse({ ...DEFAULT_FEUD_SETTINGS, targetScore: 250 }).success).toBe(false);
    expect(feudSettingsSchema.safeParse({ ...DEFAULT_FEUD_SETTINGS, stealTimerSec: 20 }).success).toBe(false);
    expect(feudSettingsSchema.safeParse({ ...DEFAULT_FEUD_SETTINGS, answersFrom: 'crowd' }).success).toBe(
      false,
    );
  });

  it('keeps every valid saved field and defaults the rest', () => {
    expect(
      parseFeudSettings({ targetScore: 400, voice: 'on', answersFrom: 'nope', answerTimerSec: -1 }),
    ).toEqual({
      ...DEFAULT_FEUD_SETTINGS,
      targetScore: 400,
      voice: 'on',
    });
    expect(parseFeudSettings(undefined)).toEqual(DEFAULT_FEUD_SETTINGS);
    expect(parseFeudSettings('garbage')).toEqual(DEFAULT_FEUD_SETTINGS);
  });

  it('hands the engine only its own five settings', () => {
    expect(toEngineSettings({ ...DEFAULT_FEUD_SETTINGS, voice: 'on', answersFrom: 'both' })).toEqual({
      targetScore: 300,
      format: 'full',
      fastMoneyEnabled: true,
      answerTimerSec: 5,
      stealTimerSec: 0,
    });
  });
});

describe('resolveFeudSettings', () => {
  it('uses the override alone without a saved bundle, and nothing when both are missing', () => {
    expect(resolveFeudSettings({ targetScore: 200 }, undefined)).toEqual({ targetScore: 200 });
    expect(resolveFeudSettings(undefined, undefined)).toBeUndefined();
  });

  it('puts the override over the saved settings', () => {
    const feud = { ...DEFAULT_FEUD_SETTINGS, targetScore: 400 as const, voice: 'on' as const };
    expect(resolveFeudSettings(undefined, { feud })).toEqual(feud);
    expect(resolveFeudSettings({ targetScore: 200 }, { feud })).toEqual({ ...feud, targetScore: 200 });
  });
});
