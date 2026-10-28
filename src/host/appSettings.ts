/**
 * App-level settings shared by the stage and the host view (HOST_FEATURE_INVENTORY §2.5). Stored in
 * the `app` group of `host_settings` (design.md §4) through `data.settings`, with a local cache so a
 * reload renders with the right values before the cloud copy arrives (design.md §7).
 */
import { z } from 'zod';
import type { DataLayer } from '@/data';
import { logger } from '@/lib/logger';

export const ANSWER_SOURCES = ['host', 'phones', 'both'] as const;
export type AnswerSource = (typeof ANSWER_SOURCES)[number];

export interface AppSettings {
  musicOn: boolean;
  /** 0..1 */
  volume: number;
  /** Hides the sidebar and host buttons on game screens (F9). */
  showMode: boolean;
  /** Subtle barrel vignette over the stage. */
  crtCurve: boolean;
  /** Speech recognition for Feud answers; falls back to typing where unsupported. */
  voice: 'off' | 'on';
  answersFrom: AnswerSource;
  /** Sets localStorage["gst:debug"] so `logger.debug` prints. */
  verboseLogging: boolean;
}

export const DEFAULT_APP_SETTINGS: Readonly<AppSettings> = {
  musicOn: true,
  volume: 0.8,
  showMode: false,
  crtCurve: false,
  voice: 'off',
  answersFrom: 'host',
  verboseLogging: false,
};

export const APP_SETTINGS_CACHE_KEY = 'gst:app-settings';

// Each field falls back on its own, so one bad value never discards the rest (TD-008).
const schema = z.object({
  musicOn: z.boolean().catch(DEFAULT_APP_SETTINGS.musicOn),
  volume: z.number().min(0).max(1).catch(DEFAULT_APP_SETTINGS.volume),
  showMode: z.boolean().catch(DEFAULT_APP_SETTINGS.showMode),
  crtCurve: z.boolean().catch(DEFAULT_APP_SETTINGS.crtCurve),
  voice: z.enum(['off', 'on']).catch(DEFAULT_APP_SETTINGS.voice),
  answersFrom: z.enum(ANSWER_SOURCES).catch(DEFAULT_APP_SETTINGS.answersFrom),
  verboseLogging: z.boolean().catch(DEFAULT_APP_SETTINGS.verboseLogging),
});

/** Unknown, missing or malformed input gives defaults; extra keys are ignored. */
export function parseAppSettings(raw: unknown): AppSettings {
  const source = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : {};
  return schema.parse(source);
}

export function readCachedAppSettings(): AppSettings | null {
  try {
    const text = globalThis.localStorage.getItem(APP_SETTINGS_CACHE_KEY);
    if (text === null) return null;
    return parseAppSettings(JSON.parse(text));
  } catch {
    return null;
  }
}

export function writeCachedAppSettings(settings: AppSettings): void {
  try {
    globalThis.localStorage.setItem(APP_SETTINGS_CACHE_KEY, JSON.stringify(settings));
  } catch {
    // Private windows and blocked storage: the cloud copy is still saved.
  }
}

/**
 * Loads the saved settings. When nothing was ever saved (empty group) `fallback` is returned, so a
 * locally cached value is not overwritten by defaults. Rejects like the repo does (not signed in).
 */
export async function loadAppSettings(
  data: Pick<DataLayer, 'settings'>,
  fallback: AppSettings = { ...DEFAULT_APP_SETTINGS },
): Promise<AppSettings> {
  const record = await data.settings.load();
  if (Object.keys(record.app).length === 0) return fallback;
  return parseAppSettings(record.app);
}

export async function saveAppSettings(
  data: Pick<DataLayer, 'settings'>,
  settings: AppSettings,
): Promise<void> {
  writeCachedAppSettings(settings);
  await data.settings.save({ app: { ...settings } });
}

/** `logger.debug` reads this key at call time, so flipping it takes effect at once. */
export function applyVerboseLogging(on: boolean): void {
  try {
    if (on) globalThis.localStorage.setItem('gst:debug', '1');
    else globalThis.localStorage.removeItem('gst:debug');
  } catch {
    logger.warn('[settings] could not store the logging preference');
  }
}

export const detectVoiceSupport = (): boolean =>
  typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

/** The link the stage hands to the laptop or tablet that will run the host view. */
export const hostViewLink = (roomCode: string): string =>
  `${window.location.origin}/host?room=${encodeURIComponent(roomCode)}`;
