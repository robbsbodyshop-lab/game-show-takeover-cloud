import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataLayer, type DataLayer } from '@/data';
import {
  APP_SETTINGS_CACHE_KEY,
  DEFAULT_APP_SETTINGS,
  loadAppSettings,
  parseAppSettings,
  readCachedAppSettings,
  saveAppSettings,
} from './appSettings';
import { SETTINGS_SAVE_DELAY_MS, useAppSettings } from './useAppSettings';

const signedInData = async (): Promise<DataLayer> => {
  const data = createDataLayer('demo');
  await data.auth.signInWithMagicLink('host@example.com');
  return data;
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('app settings defaults and parsing', () => {
  it('has the documented defaults', () => {
    expect(DEFAULT_APP_SETTINGS).toEqual({
      musicOn: true,
      volume: 0.8,
      showMode: false,
      crtCurve: false,
      voice: 'off',
      answersFrom: 'host',
      verboseLogging: false,
    });
  });

  it('turns anything unusable into defaults and keeps the valid fields', () => {
    expect(parseAppSettings(undefined)).toEqual(DEFAULT_APP_SETTINGS);
    expect(parseAppSettings('nope')).toEqual(DEFAULT_APP_SETTINGS);
    expect(parseAppSettings({ volume: 7, voice: 'maybe', answersFrom: 'phones', musicOn: false })).toEqual({
      ...DEFAULT_APP_SETTINGS,
      answersFrom: 'phones',
      musicOn: false,
    });
  });
});

describe('persistence through data.settings (group app)', () => {
  it('loads defaults before anything was saved', async () => {
    const data = await signedInData();
    expect(await loadAppSettings(data)).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('round-trips a save through the app group, leaves the other groups alone, and caches locally', async () => {
    const data = await signedInData();
    await data.settings.save({ feud: { keep: true } });
    const next = { ...DEFAULT_APP_SETTINGS, crtCurve: true, volume: 0.25, answersFrom: 'both' as const };
    await saveAppSettings(data, next);

    expect(await loadAppSettings(data)).toEqual(next);
    const record = await data.settings.load();
    expect(record.feud).toEqual({ keep: true });
    expect(record.app).toMatchObject({ crtCurve: true, volume: 0.25 });
    expect(readCachedAppSettings()).toEqual(next);
  });

  it('prefers the supplied fallback (the local cache) while the cloud group is empty', async () => {
    const data = await signedInData();
    const cached = { ...DEFAULT_APP_SETTINGS, showMode: true };
    expect(await loadAppSettings(data, cached)).toEqual(cached);
  });

  it('survives corrupt cache contents and blocked storage', () => {
    localStorage.setItem(APP_SETTINGS_CACHE_KEY, '{not json');
    expect(readCachedAppSettings()).toBeNull();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readCachedAppSettings()).toBeNull();
    vi.restoreAllMocks();
  });
});

describe('useAppSettings', () => {
  it('starts from the cache, then adopts the saved cloud copy', async () => {
    const data = await signedInData();
    await saveAppSettings(data, { ...DEFAULT_APP_SETTINGS, musicOn: false });
    localStorage.setItem(
      APP_SETTINGS_CACHE_KEY,
      JSON.stringify({ ...DEFAULT_APP_SETTINGS, volume: 0.1, musicOn: true }),
    );
    const { result } = renderHook(() => useAppSettings(data));
    expect(result.current.settings.volume).toBe(0.1);
    await waitFor(() => {
      expect(result.current.settings.musicOn).toBe(false);
    });
    expect(result.current.settings.volume).toBe(0.8);
  });

  it('applies changes at once and saves them to the cloud after a short pause', async () => {
    const data = await signedInData();
    const { result } = renderHook(() => useAppSettings(data));
    await waitFor(() => {
      expect(result.current.settings).toEqual(DEFAULT_APP_SETTINGS);
    });
    vi.useFakeTimers();
    act(() => {
      result.current.update({ volume: 0.3 });
      result.current.update({ crtCurve: true });
    });
    expect(result.current.settings).toMatchObject({ volume: 0.3, crtCurve: true });
    expect(readCachedAppSettings()).toMatchObject({ volume: 0.3, crtCurve: true });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SETTINGS_SAVE_DELAY_MS);
    });
    vi.useRealTimers();
    expect((await data.settings.load()).app).toMatchObject({ volume: 0.3, crtCurve: true });
  });

  it('flushes a pending save when it unmounts', async () => {
    const data = await signedInData();
    const { result, unmount } = renderHook(() => useAppSettings(data));
    act(() => {
      result.current.update({ showMode: true });
    });
    unmount();
    await waitFor(async () => {
      expect((await data.settings.load()).app).toMatchObject({ showMode: true });
    });
  });

  it('keeps working when nobody is signed in', async () => {
    const data = createDataLayer('demo');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { result } = renderHook(() => useAppSettings(data));
    // The failed load is logged, not thrown.
    await waitFor(() => {
      expect(warn).toHaveBeenCalled();
    });
    act(() => {
      result.current.update({ musicOn: false });
    });
    expect(result.current.settings.musicOn).toBe(false);
    expect(readCachedAppSettings()?.musicOn).toBe(false);
  });

  it('turns the verbose logging key on and off', async () => {
    const data = await signedInData();
    const { result } = renderHook(() => useAppSettings(data));
    act(() => {
      result.current.update({ verboseLogging: true });
    });
    expect(localStorage.getItem('gst:debug')).toBe('1');
    act(() => {
      result.current.update({ verboseLogging: false });
    });
    expect(localStorage.getItem('gst:debug')).toBeNull();
  });

  it('uses the seed when nothing is cached or saved, and a cached copy over it', async () => {
    const data = await signedInData();
    const seed = { ...DEFAULT_APP_SETTINGS, showMode: true, volume: 0.2 };
    const first = renderHook(() => useAppSettings(data, { seed }));
    expect(first.result.current.settings).toEqual(seed);
    first.unmount();
    localStorage.setItem(APP_SETTINGS_CACHE_KEY, JSON.stringify({ ...DEFAULT_APP_SETTINGS, volume: 0.9 }));
    const second = renderHook(() => useAppSettings(data, { seed }));
    expect(second.result.current.settings.volume).toBe(0.9);
  });

  it('reads the cloud copy again on reload, unless a change is still waiting to be saved', async () => {
    const data = await signedInData();
    const { result } = renderHook(() => useAppSettings(data));
    await waitFor(() => {
      expect(result.current.settings).toEqual(DEFAULT_APP_SETTINGS);
    });
    await saveAppSettings(data, { ...DEFAULT_APP_SETTINGS, crtCurve: true, voice: 'on' });
    act(() => {
      result.current.reload();
    });
    await waitFor(() => {
      expect(result.current.settings).toMatchObject({ crtCurve: true, voice: 'on' });
    });

    act(() => {
      result.current.update({ volume: 0.1 });
    });
    await data.settings.save({ app: { ...DEFAULT_APP_SETTINGS, volume: 0.9 } });
    act(() => {
      result.current.reload();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.settings.volume).toBe(0.1);
  });

  it('calls onSaved after a change reached the cloud', async () => {
    const data = await signedInData();
    const onSaved = vi.fn();
    const { result } = renderHook(() => useAppSettings(data, { onSaved }));
    act(() => {
      result.current.update({ musicOn: false });
    });
    await waitFor(
      () => {
        expect(onSaved).toHaveBeenCalledTimes(1);
      },
      { timeout: 2000 },
    );
    expect((await data.settings.load()).app).toMatchObject({ musicOn: false });
  });
});
