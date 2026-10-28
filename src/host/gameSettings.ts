/**
 * The "next game" settings groups `feud` and `wheel` of `host_settings` (design.md §4), kept next to the
 * `app` group (appSettings.ts): same cloud path through `data.settings`, same local cache so a reload
 * renders with the right values before the cloud copy arrives (design.md §7). The games own the schemas;
 * every read goes through their `parse*Settings`, so a bad or missing value falls back on its own.
 */
import type { DataLayer } from '@/data';
import { DEFAULT_FEUD_SETTINGS, parseFeudSettings, type FeudSettings } from '@/games/feud/settings';
import { DEFAULT_WHEEL_SETTINGS, parseWheelSettings, type WheelSettings } from '@/games/wheel/settings';

export type GameSettingsGroupName = 'feud' | 'wheel';

export interface GameSettingGroups {
  feud: FeudSettings;
  wheel: WheelSettings;
}

export const GAME_SETTINGS_CACHE_KEYS: Record<GameSettingsGroupName, string> = {
  feud: 'gst:feud-settings',
  wheel: 'gst:wheel-settings',
};

export const defaultGameSettingGroups = (): GameSettingGroups => ({
  feud: { ...DEFAULT_FEUD_SETTINGS },
  wheel: { ...DEFAULT_WHEEL_SETTINGS },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Merges `value` over `current` and parses the result, so a partial value never loses the rest. */
export function parseGameGroup<G extends GameSettingsGroupName>(
  group: G,
  value: unknown,
  current: GameSettingGroups[G],
): GameSettingGroups[G];
export function parseGameGroup(
  group: GameSettingsGroupName,
  value: unknown,
  current: FeudSettings | WheelSettings,
): FeudSettings | WheelSettings {
  const merged = { ...current, ...(isRecord(value) ? value : {}) };
  return group === 'feud' ? parseFeudSettings(merged) : parseWheelSettings(merged);
}

function readCachedGroup(group: GameSettingsGroupName): unknown {
  try {
    const text = globalThis.localStorage.getItem(GAME_SETTINGS_CACHE_KEYS[group]);
    return text === null ? null : (JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

export function readCachedGameSettings(): GameSettingGroups {
  const defaults = defaultGameSettingGroups();
  const feud = readCachedGroup('feud');
  const wheel = readCachedGroup('wheel');
  return {
    feud: feud === null ? defaults.feud : parseFeudSettings(feud),
    wheel: wheel === null ? defaults.wheel : parseWheelSettings(wheel),
  };
}

export function writeCachedGameGroup(
  group: GameSettingsGroupName,
  value: FeudSettings | WheelSettings,
): void {
  try {
    globalThis.localStorage.setItem(GAME_SETTINGS_CACHE_KEYS[group], JSON.stringify(value));
  } catch {
    // Private windows and blocked storage: the cloud copy is still saved.
  }
}

/**
 * Loads both groups. A group that was never saved (empty) keeps `fallback`, so a cached value is not
 * overwritten by defaults. Rejects like the repo does (not signed in).
 */
export async function loadGameSettings(
  data: Pick<DataLayer, 'settings'>,
  fallback: GameSettingGroups = defaultGameSettingGroups(),
): Promise<GameSettingGroups> {
  const record = await data.settings.load();
  return {
    feud: Object.keys(record.feud).length === 0 ? fallback.feud : parseFeudSettings(record.feud),
    wheel: Object.keys(record.wheel).length === 0 ? fallback.wheel : parseWheelSettings(record.wheel),
  };
}

export async function saveGameGroup(
  data: Pick<DataLayer, 'settings'>,
  group: GameSettingsGroupName,
  value: FeudSettings | WheelSettings,
): Promise<void> {
  writeCachedGameGroup(group, value);
  await data.settings.save(group === 'feud' ? { feud: { ...value } } : { wheel: { ...value } });
}
