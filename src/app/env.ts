/**
 * How the app is running. `demo` means no Supabase: in-memory data and the in-process or
 * BroadcastChannel room hub (design.md §3, §16). Chosen by `--mode demo`, by `?demo=1`, or
 * automatically when the Supabase variables are absent.
 */
export type AppMode = 'demo' | 'supabase';

export const resolveAppMode = (
  env: { MODE?: string; VITE_SUPABASE_URL?: string; VITE_SUPABASE_PUBLISHABLE_KEY?: string },
  search: string,
): AppMode => {
  if (env.MODE === 'demo') return 'demo';
  if (new URLSearchParams(search).get('demo') === '1') return 'demo';
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY) return 'demo';
  return 'supabase';
};

export const appMode = (): AppMode => resolveAppMode(import.meta.env, window.location.search);
