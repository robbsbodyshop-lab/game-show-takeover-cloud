import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/design/global.css';
import { createBrowserAudioPlayer } from '@/audio/player';
import { createDataLayer } from '@/data';
import { BroadcastRoomHub, createRoomTransport, type RoomTransport } from '@/realtime';
import { getConfiguredClient } from '@/data/supabaseClient';
import { logger } from '@/lib/logger';
import { App } from './App';
import { AppServicesProvider, type AppServices } from './AppContext';
import { appMode } from './env';

const buildServices = (): AppServices => {
  const mode = appMode();
  const data = createDataLayer(mode);
  const client = mode === 'supabase' ? getConfiguredClient() : null;
  // Demo mode: an in-process hub relayed across tabs of this origin, so a demo phone in a second
  // tab reaches the stage without any server.
  const hub = new BroadcastRoomHub();
  // The role is applied on connect(); every transport is built the same way.
  const createTransport = (): RoomTransport =>
    client ? createRoomTransport('supabase', { client }) : createRoomTransport('memory', { hub });
  logger.debug('app mode', mode);
  return { mode, data, createTransport, audio: createBrowserAudioPlayer(), version: __APP_VERSION__ };
};

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(
  <StrictMode>
    <AppServicesProvider value={buildServices()}>
      <App />
    </AppServicesProvider>
  </StrictMode>,
);
