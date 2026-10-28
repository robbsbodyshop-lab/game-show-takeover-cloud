import { createContext, useContext } from 'react';
import type { AudioPlayer } from '@/audio/player';
import type { DataLayer } from '@/data';
import type { Role, RoomTransport } from '@/realtime';
import type { AppMode } from './env';

/**
 * Everything a screen needs from the outside world, built once in `main.tsx` (real) or in a test.
 * Screens never import Supabase, the transports or the audio context directly (conventions.md).
 */
export interface AppServices {
  mode: AppMode;
  data: DataLayer;
  /** A fresh transport for a role; the caller connects it with a room code. */
  createTransport: (role: Role) => RoomTransport;
  audio: AudioPlayer;
  /** App version from package.json, for the credits and the boot screen. */
  version: string;
}

const AppServicesContext = createContext<AppServices | null>(null);

export const AppServicesProvider = AppServicesContext.Provider;

export const useAppServices = (): AppServices => {
  const services = useContext(AppServicesContext);
  if (!services) throw new Error('useAppServices must be used inside AppServicesProvider');
  return services;
};
