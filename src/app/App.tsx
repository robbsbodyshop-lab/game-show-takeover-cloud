import { lazy, Suspense } from 'react';
import { routeFromPath } from './routes';

// Each entry point is its own chunk so a phone never downloads the stage (NFR-004).
const StageApp = lazy(() => import('@/stage/StageApp').then((m) => ({ default: m.StageApp })));
const HostView = lazy(() => import('@/host/HostView').then((m) => ({ default: m.HostView })));
const PhoneApp = lazy(() => import('@/phone/PhoneApp').then((m) => ({ default: m.PhoneApp })));
const DesignGallery = lazy(() =>
  import('@/design/DesignGallery').then((m) => ({ default: m.DesignGallery })),
);

/** Picks the entry point from the path. Services come from `AppServicesProvider` in main.tsx. */
export const App = () => {
  const route = routeFromPath(window.location.pathname);
  const screen = (() => {
    switch (route) {
      case 'host':
        return <HostView />;
      case 'play':
        return <PhoneApp />;
      case 'design':
        return import.meta.env.DEV ? <DesignGallery /> : <StageApp />;
      default:
        return <StageApp />;
    }
  })();
  return <Suspense fallback={null}>{screen}</Suspense>;
};
