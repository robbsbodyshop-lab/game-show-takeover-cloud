import { describe, expect, it } from 'vitest';
import { toRound } from '@/engines/wheel/testKit';
import { phoneControls } from '@/engines/wheel/selectors';
import { EMPTY_WHEEL_HOST_DATA, buildWheelHostData, describeState, readWheelHostData } from './hostData';
import { DEFAULT_WHEEL_SETTINGS } from './settings';

describe('readWheelHostData', () => {
  it('never throws: anything that is not the data gives the empty data', () => {
    for (const bad of [undefined, null, 7, 'x', [], { teams: 'nope' }]) {
      const data = readWheelHostData(bad);
      expect(data.teams).toEqual([]);
      expect(data.legal).toEqual([]);
      expect(data.settings).toEqual(DEFAULT_WHEEL_SETTINGS);
    }
    expect(readWheelHostData({})).toEqual(EMPTY_WHEEL_HOST_DATA);
  });

  it('keeps good fields when others are malformed', () => {
    const data = readWheelHostData({
      headline: 'Round 1',
      bell: 'yes',
      teams: [{ id: 1, name: 'Red', bank: 'lots' }],
    });
    expect(data.headline).toBe('Round 1');
    expect(data.bell).toBe(false);
    expect(data.teams[0]).toMatchObject({ id: 1, name: 'Red', bank: 0 });
  });
});

describe('buildWheelHostData', () => {
  const state = toRound(1);
  const build = () =>
    buildWheelHostData({
      state,
      phone: phoneControls(state),
      clock: null,
      pending: { team: 1, answer: 'red apple pies', source: 'phone' },
      nextSettings: DEFAULT_WHEEL_SETTINGS,
      spinning: false,
      acting: 1,
    });

  it('carries the host-only facts and survives a JSON round trip', () => {
    const data = build();
    expect(data.puzzle).toMatchObject({ phrase: 'RED APPLE PIE', category: 'THING' });
    expect(data.nextPuzzle?.phrase).toBe('SPARE PUZZLE');
    expect(data.pending).toEqual({ team: 1, answer: 'red apple pies', source: 'phone' });
    expect(data.legal).toContain('SPIN');
    expect(readWheelHostData(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });

  it('describes whose move it is in plain words', () => {
    expect(describeState(state)).toBe('Round 1: Red to spin, buy a vowel or solve');
    expect(describeState({ ...state, stage: 'speedup', phase: 'speedup-window' })).toContain('Speed-Up');
  });
});
