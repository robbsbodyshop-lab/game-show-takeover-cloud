import { describe, expect, it } from 'vitest';
import { routeFromPath } from './routes';

describe('routeFromPath', () => {
  it('maps the three entry points and defaults to the stage', () => {
    expect(routeFromPath('/')).toBe('stage');
    expect(routeFromPath('/host')).toBe('host');
    expect(routeFromPath('/host/anything')).toBe('host');
    expect(routeFromPath('/play')).toBe('play');
    expect(routeFromPath('/design')).toBe('design');
    expect(routeFromPath('/e/123')).toBe('stage');
  });
});
