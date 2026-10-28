/**
 * Browser-local stage preferences (HOST_FEATURE_INVENTORY.md 2.3, 2.5, 4.1): show mode is
 * "remembered across launches", music and volume live in Settings. Every read and write is wrapped
 * because storage can be missing or blocked (private window, previews); the stage then simply uses
 * the defaults.
 */
export const SETTINGS_KEYS = {
  showMode: 'gst:showMode',
  musicOn: 'gst:musicOn',
  volume: 'gst:volume',
  crt: 'gst:crt',
  /** Read by `lib/logger.ts` to switch `debug` output on. */
  verbose: 'gst:debug',
} as const;

export interface StageSettings {
  showMode: boolean;
  musicOn: boolean;
  /** Master volume 0..1. */
  volume: number;
  /** CRT curve overlay (`html[data-crt='on']`). */
  crt: boolean;
  verbose: boolean;
}

export const DEFAULT_STAGE_SETTINGS: StageSettings = {
  showMode: false,
  musicOn: true,
  volume: 0.8,
  crt: false,
  verbose: false,
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const defaultStorage = (): StorageLike | null => {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
};

const readRaw = (storage: StorageLike | null, key: string): string | null => {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

const readFlag = (storage: StorageLike | null, key: string, fallback: boolean): boolean => {
  const raw = readRaw(storage, key);
  return raw === null ? fallback : raw === '1';
};

export const clampVolume = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : DEFAULT_STAGE_SETTINGS.volume;

export function loadStageSettings(storage: StorageLike | null = defaultStorage()): StageSettings {
  const rawVolume = readRaw(storage, SETTINGS_KEYS.volume);
  const volume = rawVolume === null ? Number.NaN : Number(rawVolume);
  return {
    showMode: readFlag(storage, SETTINGS_KEYS.showMode, DEFAULT_STAGE_SETTINGS.showMode),
    musicOn: readFlag(storage, SETTINGS_KEYS.musicOn, DEFAULT_STAGE_SETTINGS.musicOn),
    volume: rawVolume === null ? DEFAULT_STAGE_SETTINGS.volume : clampVolume(volume),
    crt: readFlag(storage, SETTINGS_KEYS.crt, DEFAULT_STAGE_SETTINGS.crt),
    verbose: readFlag(storage, SETTINGS_KEYS.verbose, DEFAULT_STAGE_SETTINGS.verbose),
  };
}

export function saveStageSettings(
  settings: StageSettings,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  const flag = (value: boolean): string => (value ? '1' : '0');
  try {
    storage.setItem(SETTINGS_KEYS.showMode, flag(settings.showMode));
    storage.setItem(SETTINGS_KEYS.musicOn, flag(settings.musicOn));
    storage.setItem(SETTINGS_KEYS.volume, String(settings.volume));
    storage.setItem(SETTINGS_KEYS.crt, flag(settings.crt));
    if (settings.verbose) storage.setItem(SETTINGS_KEYS.verbose, '1');
    else storage.removeItem(SETTINGS_KEYS.verbose);
  } catch {
    // Storage is a convenience only.
  }
}
