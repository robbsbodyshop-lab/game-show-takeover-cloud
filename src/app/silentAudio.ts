import type { AudioPlayer } from '@/audio/player';

/**
 * The phone (`play.html`) and the host console (`host.html`) never play sound, but `AppServices` is
 * shared with the stage and requires an `AudioPlayer`. This null object answers every method with a
 * no-op so those entries do not ship the audio player or the cue registry (NFR-004). Only a type is
 * imported from `@/audio/player`; nothing of it reaches the bundle.
 */
export const createSilentAudio = (): AudioPlayer =>
  new Proxy({}, { get: () => () => undefined }) as unknown as AudioPlayer;
