import { useEffect } from 'react';
import type { AudioPlayer } from '@/audio/player';

export interface UseStageAudioOptions {
  audio: AudioPlayer;
  /** The hub loop plays only on the hub, and only when music is on. */
  hubMusic: boolean;
  /** Paused or a dialog is open: every cue and bed holds (FR-015). */
  locked: boolean;
}

export function useStageAudio({ audio, hubMusic, locked }: UseStageAudioOptions): void {
  useEffect(() => {
    if (!hubMusic) return;
    audio.loop('hub_theme');
    return () => {
      audio.stopLoop('hub_theme');
    };
  }, [audio, hubMusic]);

  useEffect(() => {
    if (!locked) return;
    audio.pauseAll();
    return () => {
      audio.resumeAll();
    };
  }, [audio, locked]);

  useEffect(
    () => () => {
      audio.stopAll();
    },
    [audio],
  );
}
