import { describe, expect, it } from 'vitest';
import { DEFAULT_FEUD_SETTINGS, feudSettingsSchema, parseFeudSettings, toEngineSettings } from './settings';

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
