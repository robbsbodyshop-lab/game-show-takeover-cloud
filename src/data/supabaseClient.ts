import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Builds a browser client. The key is the publishable (anon) key: public by design, protected by RLS. */
export function createSupabaseClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  }) as SupabaseClient;
}

let configured: SupabaseClient | null | undefined;

function readEnv(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_PUBLISHABLE_KEY'): string | null {
  const value: unknown = import.meta.env[name];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * The shared client built from `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`, or `null`
 * when either is missing (demo mode). Created once so the data layer and the realtime transport
 * share one auth session.
 */
export function getConfiguredClient(): SupabaseClient | null {
  if (configured !== undefined) return configured;
  const url = readEnv('VITE_SUPABASE_URL');
  const key = readEnv('VITE_SUPABASE_PUBLISHABLE_KEY');
  configured = url !== null && key !== null ? createSupabaseClient(url, key) : null;
  return configured;
}

/** Test helper: forget the cached client so the next call re-reads the environment. */
export function resetConfiguredClientForTests(): void {
  configured = undefined;
}
