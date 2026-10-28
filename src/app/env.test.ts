import { describe, expect, it } from 'vitest';
import { resolveAppMode } from './env';

const configured = {
  VITE_SUPABASE_URL: 'https://x.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
};

describe('resolveAppMode', () => {
  it('is demo without Supabase variables', () => {
    expect(resolveAppMode({}, '')).toBe('demo');
  });
  it('is supabase when configured', () => {
    expect(resolveAppMode(configured, '')).toBe('supabase');
  });
  it('forces demo with ?demo=1 or --mode demo', () => {
    expect(resolveAppMode(configured, '?demo=1&room=DMKT')).toBe('demo');
    expect(resolveAppMode({ ...configured, MODE: 'demo' }, '')).toBe('demo');
  });
});
