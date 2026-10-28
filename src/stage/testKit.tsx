/** Helpers for the stage tests: fake `AppServices` on the demo data layer and the in-memory hub. */
import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { AppServicesProvider, type AppServices } from '@/app/AppContext';
import { AudioPlayer } from '@/audio/player';
import { createDataLayer, type DataLayer } from '@/data';
import { MemoryRoomHub, MemoryRoomTransport, type RoomTransport } from '@/realtime';
import type { AppMode } from '@/app/env';

export interface TestServices extends AppServices {
  hub: MemoryRoomHub;
  audio: AudioPlayer;
  /** Every stage transport made through `createTransport`. */
  transports: RoomTransport[];
}

export function createTestServices(mode: AppMode = 'demo'): TestServices {
  const hub = new MemoryRoomHub();
  const transports: RoomTransport[] = [];
  let tick = 1_700_000_000_000;
  return {
    mode,
    // An advancing clock so events created back to back have distinct, ordered timestamps.
    data: createDataLayer('demo', { memory: { now: () => (tick += 1000) } }),
    createTransport: () => {
      const transport = new MemoryRoomTransport({ hub, ua: 'test' });
      transports.push(transport);
      return transport;
    },
    audio: new AudioPlayer({ context: null }),
    version: 'test',
    hub,
    transports,
  };
}

export const HOST_EMAIL = 'host@example.com';
export const HOST_PASSWORD = 'secret-pass';

/** Signs the test host up (the memory auth signs in immediately). */
export async function signUpHost(data: DataLayer) {
  const result = await data.auth.signUp(HOST_EMAIL, HOST_PASSWORD);
  if (!result.ok || !result.session) throw new Error('test host sign-up failed');
  return result.session.user;
}

export function renderWithServices(ui: ReactElement, services: AppServices) {
  return render(<AppServicesProvider value={services}>{ui}</AppServicesProvider>);
}

/** Lets promise chains and queued microtasks settle (memory transport delivers in microtasks). */
export const flushPromises = async (rounds = 5): Promise<void> => {
  for (let i = 0; i < rounds; i += 1) await Promise.resolve();
};
