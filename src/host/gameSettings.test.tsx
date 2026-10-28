import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataLayer, type DataLayer } from '@/data';
import { DEFAULT_FEUD_SETTINGS } from '@/games/feud/settings';
import { DEFAULT_WHEEL_SETTINGS } from '@/games/wheel/settings';
import {
  GAME_SETTINGS_CACHE_KEYS,
  loadGameSettings,
  parseGameGroup,
  readCachedGameSettings,
  saveGameGroup,
} from './gameSettings';
import { GameSettingsFields } from './GameSettingsFields';
import { useGameSettingGroups } from './useGameSettingGroups';

const signedInData = async (): Promise<DataLayer> => {
  const data = createDataLayer('demo');
  await data.auth.signInWithMagicLink('host@example.com');
  return data;
};

beforeEach(() => {
  localStorage.clear();
});

describe('game settings groups', () => {
  it('gives the defaults when nothing was saved or cached', async () => {
    const data = await signedInData();
    expect(readCachedGameSettings()).toEqual({ feud: DEFAULT_FEUD_SETTINGS, wheel: DEFAULT_WHEEL_SETTINGS });
    expect(await loadGameSettings(data)).toEqual({
      feud: DEFAULT_FEUD_SETTINGS,
      wheel: DEFAULT_WHEEL_SETTINGS,
    });
  });

  it('keeps each valid field, defaults the rest, and merges a partial value over the current group', () => {
    const current = { ...DEFAULT_FEUD_SETTINGS, targetScore: 400 as const };
    expect(parseGameGroup('feud', { format: 'one-round', stealTimerSec: 99 }, current)).toEqual({
      ...DEFAULT_FEUD_SETTINGS,
      targetScore: 400,
      format: 'one-round',
    });
    expect(parseGameGroup('wheel', 'nonsense', { ...DEFAULT_WHEEL_SETTINGS, length: 'short' })).toEqual({
      ...DEFAULT_WHEEL_SETTINGS,
      length: 'short',
    });
  });

  it('saves one group, caches it, and leaves the other groups alone', async () => {
    const data = await signedInData();
    await data.settings.save({ app: { musicOn: false } });
    await saveGameGroup(data, 'wheel', { ...DEFAULT_WHEEL_SETTINGS, opening: 'frenzy' });
    const record = await data.settings.load();
    expect(record.app).toEqual({ musicOn: false });
    expect(record.wheel).toMatchObject({ opening: 'frenzy' });
    expect(record.feud).toEqual({});
    expect(JSON.parse(localStorage.getItem(GAME_SETTINGS_CACHE_KEYS.wheel) ?? '{}')).toMatchObject({
      opening: 'frenzy',
    });
    expect((await loadGameSettings(data)).feud).toEqual(DEFAULT_FEUD_SETTINGS);
  });
});

describe('useGameSettingGroups', () => {
  it('starts from the cache, adopts the saved copy, and applies and saves a change at once', async () => {
    const data = await signedInData();
    await data.settings.save({ feud: { targetScore: 500 } });
    localStorage.setItem(GAME_SETTINGS_CACHE_KEYS.feud, JSON.stringify({ targetScore: 200 }));
    const onSaved = vi.fn();
    const { result } = renderHook(() => useGameSettingGroups(data, { onSaved }));
    expect(result.current.feud.targetScore).toBe(200);
    await waitFor(() => {
      expect(result.current.feud.targetScore).toBe(500);
    });

    act(() => {
      result.current.save('feud', { ...result.current.feud, format: 'one-round' });
    });
    expect(result.current.feud).toMatchObject({ targetScore: 500, format: 'one-round' });
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1);
    });
    expect((await data.settings.load()).feud).toMatchObject({ targetScore: 500, format: 'one-round' });
  });

  it('reads the saved copy again on reload', async () => {
    const data = await signedInData();
    const { result } = renderHook(() => useGameSettingGroups(data));
    await act(async () => {
      await Promise.resolve();
    });
    await data.settings.save({ wheel: { length: 'short' } });
    act(() => {
      result.current.reload();
    });
    await waitFor(() => {
      expect(result.current.wheel.length).toBe('short');
    });
  });

  it('keeps working when nobody is signed in', async () => {
    const data = createDataLayer('demo');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { result } = renderHook(() => useGameSettingGroups(data));
    act(() => {
      result.current.save('wheel', { bonusRound: false });
    });
    expect(result.current.wheel.bonusRound).toBe(false);
    await waitFor(() => {
      expect(warn).toHaveBeenCalled();
    });
    warn.mockRestore();
  });
});

describe('GameSettingsFields', () => {
  it('shows both sections with the saved values and reports the whole group on every change', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <GameSettingsFields
        feud={{ ...DEFAULT_FEUD_SETTINGS, targetScore: 400 }}
        wheel={{ ...DEFAULT_WHEEL_SETTINGS, length: 'short' }}
        onSave={onSave}
      />,
    );
    expect(screen.getByText('Family Feud (next game)')).toBeInTheDocument();
    expect(screen.getByText('Wheel of Fortune (next game)')).toBeInTheDocument();
    expect(screen.getByLabelText('Winning score')).toHaveValue('400');
    expect(screen.getByLabelText('Length')).toHaveValue('short');
    expect(screen.getByRole('checkbox', { name: 'Fast Money' })).toBeChecked();

    await user.selectOptions(screen.getByLabelText('Answer timer'), '15');
    expect(onSave).toHaveBeenLastCalledWith('feud', {
      ...DEFAULT_FEUD_SETTINGS,
      targetScore: 400,
      answerTimerSec: 15,
    });
    await user.selectOptions(screen.getByLabelText('Turn timer'), '10');
    expect(onSave).toHaveBeenLastCalledWith('wheel', {
      ...DEFAULT_WHEEL_SETTINGS,
      length: 'short',
      turnTimerSec: 10,
    });
    await user.click(screen.getByRole('checkbox', { name: 'Bonus Round' }));
    expect(onSave).toHaveBeenLastCalledWith('wheel', {
      ...DEFAULT_WHEEL_SETTINGS,
      length: 'short',
      bonusRound: false,
    });
  });

  it('still shows a saved value that the list does not offer', () => {
    render(
      <GameSettingsFields
        feud={{ ...DEFAULT_FEUD_SETTINGS, answerTimerSec: 0 }}
        wheel={DEFAULT_WHEEL_SETTINGS}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Answer timer')).toHaveValue('0');
  });
});
