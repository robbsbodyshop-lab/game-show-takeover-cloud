import { useCallback, useEffect, useState } from 'react';
import type { AudioPlayer } from '@/audio/player';
import { clampVolume, loadStageSettings, saveStageSettings, type StageSettings } from './stageSettings';

export interface StageSettingsApi {
  settings: StageSettings;
  update: (patch: Partial<StageSettings>) => void;
}

/** Loads the stored preferences, saves every change, and applies the CRT overlay and volume. */
export function useStageSettings(audio: AudioPlayer): StageSettingsApi {
  const [settings, setSettings] = useState<StageSettings>(loadStageSettings);

  const update = useCallback((patch: Partial<StageSettings>) => {
    setSettings((prev) => ({
      ...prev,
      ...patch,
      volume: clampVolume(patch.volume ?? prev.volume),
    }));
  }, []);

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

  return { settings, update };
}
