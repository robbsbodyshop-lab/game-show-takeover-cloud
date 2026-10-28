import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/design/global.css';
import { logger } from '@/lib/logger';
import { AppServicesProvider } from './AppContext';
import { buildLightServices, type LightKind } from './lightServices';

/** Shared bootstrap of `playMain` and `hostMain`: build the light services, then render `screen`. */
export function mountLight(kind: LightKind, screen: ReactNode): void {
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing #root element');
  const reactRoot = createRoot(root);
  buildLightServices(kind).then(
    (services) => {
      reactRoot.render(
        <StrictMode>
          <AppServicesProvider value={services}>{screen}</AppServicesProvider>
        </StrictMode>,
      );
    },
    (error: unknown) => {
      logger.error('could not start', error);
      reactRoot.render(<p role="alert">Could not start. Check your connection and reload.</p>);
    },
  );
}
