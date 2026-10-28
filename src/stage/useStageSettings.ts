import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AudioPlayer } from '@/audio/player';
import type { DataLayer } from '@/data';
import { DEFAULT_APP_SETTINGS, type AppSettings } from '@/host/appSettings';
import { useAppSettings } from '@/host/useAppSettings';
import { clampVolume, loadStageSettings, saveStageSettings, type StageSettings } from './stageSettings';

/** What the stage reads live: its own display preferences plus the answer settings the Feud game uses. */
export type StageLiveSettings = StageSettings & Pick<AppSettings, 'voice' | 'answersFrom'>;

export interface StageSettingsApi {
  settings: StageLiveSettings;
  update: (patch: Partial<StageLiveSettings>) => void;
  /** Reads the account copy again (the host view saved settings). */
  reload: () => void;
}

/** Older local preferences become the first `app` settings, so nothing is lost on upgrade. */
const seedFromLocal = (): AppSettings => {
  const local = loadStageSettings();
  return {
    ...DEFAULT_APP_SETTINGS,
    showMode: local.showMode,
    musicOn: local.musicOn,
    volume: local.volume,
    crtCurve: local.crt,
    verboseLogging: local.verbose,
  };
};

const toLive = (app: AppSettings): StageLiveSettings => ({
  showMode: app.showMode,
  musicOn: app.musicOn,
  volume: app.volume,
  crt: app.crtCurve,
  verbose: app.verboseLogging,
  voice: app.voice,
  answersFrom: app.answersFrom,
});

const toAppPatch = (patch: Partial<StageLiveSettings>): Partial<AppSettings> => ({
  ...(patch.showMode === undefined ? {} : { showMode: patch.showMode }),
  ...(patch.musicOn === undefined ? {} : { musicOn: patch.musicOn }),
  ...(patch.volume === undefined ? {} : { volume: clampVolume(patch.volume) }),
  ...(patch.crt === undefined ? {} : { crtCurve: patch.crt }),
  ...(patch.verbose === undefined ? {} : { verboseLogging: patch.verbose }),
  ...(patch.voice === undefined ? {} : { voice: patch.voice }),
  ...(patch.answersFrom === undefined ? {} : { answersFrom: patch.answersFrom }),
});

/**
 * The stage's preferences live in the `app` group of the host's settings, the same copy the host view
 * edits (design.md §4), cached in this browser. Changes apply at once: CRT overlay, volume, music, show
 * mode; the local keys the stage always wrote are kept in step so a reload before the account copy
 * arrives still looks right.
 */
export function useStageSettings(audio: AudioPlayer, data: Pick<DataLayer, 'settings'>): StageSettingsApi {
  const [seed] = useState(seedFromLocal);
  const app = useAppSettings(data, { seed });
  const settings = useMemo(() => toLive(app.settings), [app.settings]);

  const { update: updateApp } = app;
  const update = useCallback(
    (patch: Partial<StageLiveSettings>) => {
      updateApp(toAppPatch(patch));
    },
    [updateApp],
  );

  useEffect(() => {
    saveStageSettings(settings);
  }, [settings]);

  useEffect(() => {
    audio.setVolume(settings.volume);
  }, [audio, settings.volume]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.crt) root.dataset.crt = 'on';
    else delete root.dataset.crt;
    return () => {
      delete root.dataset.crt;
    };
  }, [settings.crt]);

  return { settings, update, reload: app.reload };
}
