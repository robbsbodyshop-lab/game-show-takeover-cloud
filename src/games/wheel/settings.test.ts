import { describe, expect, it } from 'vitest';
import { DEFAULT_WHEEL_SETTINGS, parseWheelSettings, wheelSettingsSchema } from './settings';

describe('WheelSettings', () => {
  it('defaults to classic toss-ups, the bell, a full show, the Bonus Round on and no turn timer', () => {
    expect(DEFAULT_WHEEL_SETTINGS).toEqual({
      opening: 'classic',
      speedUpStart: 'bell',
      length: 'full',
      bonusRound: true,
      turnTimerSec: 0,
    });
    expect(parseWheelSettings(undefined)).toEqual(DEFAULT_WHEEL_SETTINGS);
    expect(parseWheelSettings({})).toEqual(DEFAULT_WHEEL_SETTINGS);
  });

  it('keeps good fields and falls back field by field', () => {
    expect(
      parseWheelSettings({ opening: 'frenzy', length: 'weird', bonusRound: false, turnTimerSec: 7 }),
    ).toEqual({
      opening: 'frenzy',
      speedUpStart: 'bell',
      length: 'full',
      bonusRound: false,
      turnTimerSec: 0,
    });
    expect(parseWheelSettings({ turnTimerSec: 10, speedUpStart: 'round4', length: 'short' })).toMatchObject({
      turnTimerSec: 10,
      speedUpStart: 'round4',
      length: 'short',
    });
  });

  it('ignores extra keys and non-objects', () => {
    expect(parseWheelSettings({ extra: 1 })).toEqual(DEFAULT_WHEEL_SETTINGS);
    expect(parseWheelSettings('nope')).toEqual(DEFAULT_WHEEL_SETTINGS);
    expect(parseWheelSettings([1, 2])).toEqual(DEFAULT_WHEEL_SETTINGS);
    expect(Object.keys(wheelSettingsSchema.parse({ extra: 1 }))).not.toContain('extra');
  });
});
