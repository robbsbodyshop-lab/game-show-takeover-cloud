import { routeFromPath } from './routes';

/** Placeholder shell; each route gets its real app in later tasks. */
export const App = () => {
  const route = routeFromPath(window.location.pathname);
  return (
    <main>
      <h1>Game Show Takeover</h1>
      <p data-testid="route">{route}</p>
      <p>v{__APP_VERSION__}</p>
    </main>
  );
};
