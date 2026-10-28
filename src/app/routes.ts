/** The three entry points of the app, chosen from the URL path. No router dependency (TD-007). */
export type Route = 'stage' | 'host' | 'play' | 'design';

export const routeFromPath = (pathname: string): Route => {
  const first = pathname.split('/').find(Boolean) ?? '';
  switch (first) {
    case 'host':
      return 'host';
    case 'play':
      return 'play';
    case 'design':
      return 'design';
    default:
      return 'stage';
  }
};
