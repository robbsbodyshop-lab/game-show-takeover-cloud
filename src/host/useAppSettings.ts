import { useCallback, useEffect, useRef, useState } from 'react';
import type { DataLayer } from '@/data';
import { logger } from '@/lib/logger';
import {
  applyVerboseLogging,
  DEFAULT_APP_SETTINGS,
  loadAppSettings,
  readCachedAppSettings,
  saveAppSettings,
  writeCachedAppSettings,
  type AppSettings,
} from './appSettings';

export const SETTINGS_SAVE_DELAY_MS = 400;

export interface UseAppSettingsOptions {
  /** Used instead of the defaults when nothing is cached yet (the stage's older local preferences). */
  seed?: AppSettings;
  /** Called after a change reached the cloud copy (the host view tells the stage to re-read it). */
  onSaved?: () => void;
}

export interface UseAppSettings {
  settings: AppSettings;
  /** Applies at once, caches locally, and saves to the cloud after a short pause (sliders). */
  update: (patch: Partial<AppSettings>) => void;
  /** Reads the cloud copy again (another surface saved). A change still waiting to be saved wins. */
  reload: () => void;
}

/** Settings state for the stage and the host view. Never throws: a failed load or save is logged. */
export function useAppSettings(
  data: Pick<DataLayer, 'settings'>,
  options: UseAppSettingsOptions = {},
): UseAppSettings {
  const [settings, setSettings] = useState<AppSettings>(
    () => readCachedAppSettings() ?? options.seed ?? { ...DEFAULT_APP_SETTINGS },
  );
  const latest = useRef(settings);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const onSaved = useRef(options.onSaved);
  useEffect(() => {
    onSaved.current = options.onSaved;
  });

  const save = useCallback(
    (next: AppSettings) => {
      saveAppSettings(data, next).then(
        () => {
          onSaved.current?.();
        },
        (error: unknown) => {
          logger.warn('[settings] save failed', error);
        },
      );
    },
    [data],
  );

  const reload = useCallback(() => {
    if (saveTimer.current !== null) return;
    loadAppSettings(data, latest.current)
      .then((loaded) => {
        if (!alive.current || saveTimer.current !== null) return;
        writeCachedAppSettings(loaded);
        if (JSON.stringify(loaded) === JSON.stringify(latest.current)) return;
        latest.current = loaded;
        setSettings(loaded);
      })
      .catch((error: unknown) => {
        logger.warn('[settings] load failed, using the cached copy', error);
      });
  }, [data]);

  useEffect(() => {
    alive.current = true;
    reload();
    return () => {
      alive.current = false;
    };
  }, [reload]);

  useEffect(() => {
    applyVerboseLogging(settings.verboseLogging);
  }, [settings.verboseLogging]);

  // Flush a pending save when the page goes away so the last slider position is kept.
  useEffect(
    () => () => {
      if (saveTimer.current !== null) {
        clearTimeout(saveTimer.current);
        save(latest.current);
      }
    },
    [save],
  );

  const update = useCallback(
    (patch: Partial<AppSettings>) => {
      const next = { ...latest.current, ...patch };
      latest.current = next;
      writeCachedAppSettings(next);
      setSettings(next);
      if (saveTimer.current !== null) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        save(latest.current);
      }, SETTINGS_SAVE_DELAY_MS);
    },
    [save],
  );

  return { settings, update, reload };
}
