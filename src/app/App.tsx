import { lazy, Suspense } from 'react';
import { HostView } from '@/host/HostView';
import { PhoneApp } from '@/phone/PhoneApp';
import { StageApp } from '@/stage/StageApp';
import { routeFromPath } from './routes';

const DesignGallery = lazy(() =>
  import('@/design/DesignGallery').then((m) => ({ default: m.DesignGallery })),
);

/** Picks the entry point from the path. Services come from `AppServicesProvider` in main.tsx. */
export const App = () => {
  const route = routeFromPath(window.location.pathname);
  switch (route) {
    case 'host':
      return <HostView />;
    case 'play':
      return <PhoneApp />;
    case 'design':
      return import.meta.env.DEV ? (
        <Suspense fallback={null}>
          <DesignGallery />
        </Suspense>
      ) : (
        <StageApp />
      );
    default:
      return <StageApp />;
  }
};
