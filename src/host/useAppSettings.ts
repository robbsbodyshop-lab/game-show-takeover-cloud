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

export interface UseAppSettings {
  settings: AppSettings;
  /** Applies at once, caches locally, and saves to the cloud after a short pause (sliders). */
  update: (patch: Partial<AppSettings>) => void;
}

/** Settings state for the stage and the host view. Never throws: a failed load or save is logged. */
export function useAppSettings(data: Pick<DataLayer, 'settings'>): UseAppSettings {
  const [settings, setSettings] = useState<AppSettings>(
    () => readCachedAppSettings() ?? { ...DEFAULT_APP_SETTINGS },
  );
  const latest = useRef(settings);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    (next: AppSettings) => {
      saveAppSettings(data, next).catch((error: unknown) => {
        logger.warn('[settings] save failed', error);
      });
    },
    [data],
  );

  useEffect(() => {
    let cancelled = false;
    loadAppSettings(data, latest.current)
      .then((loaded) => {
        if (cancelled) return;
        latest.current = loaded;
        writeCachedAppSettings(loaded);
        setSettings(loaded);
      })
      .catch((error: unknown) => {
        logger.warn('[settings] load failed, using the cached copy', error);
      });
    return () => {
      cancelled = true;
    };
  }, [data]);

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

  return { settings, update };
}
