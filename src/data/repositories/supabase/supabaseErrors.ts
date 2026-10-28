import type { SupabaseClient } from '@supabase/supabase-js';
import { DataError, type DataErrorCode } from '../../errors';

/** The shape shared by PostgREST errors and supabase-js auth errors that we care about. */
export interface SupabaseErrorLike {
  message: string;
  code?: string | undefined;
  status?: number | undefined;
}

export const RATE_LIMITED_CODE = 'PT429';
export const RATE_LIMITED_MESSAGE = 'rate_limited';

export function isRateLimited(error: SupabaseErrorLike): boolean {
  return error.code === RATE_LIMITED_CODE || error.message === RATE_LIMITED_MESSAGE || error.status === 429;
}

export function toDataError(error: SupabaseErrorLike): DataError {
  let code: DataErrorCode = 'unknown';
  if (error.code === '42501' || error.status === 403) code = 'forbidden';
  else if (error.code === 'PGRST116') code = 'not_found';
  else if (error.code === '28000' || error.status === 401 || error.message === 'not_authenticated') {
    code = 'not_authenticated';
  } else if (/failed to fetch|network|timeout/i.test(error.message)) code = 'unavailable';
  return new DataError(code, error.message, { cause: error });
}

/** Throws a DataError for `error`; returns `data` otherwise. */
export function unwrap<T>(result: { data: T; error: SupabaseErrorLike | null }): T {
  if (result.error) throw toDataError(result.error);
  return result.data;
}

/** `client.rpc` with the untyped `data` narrowed to `unknown` so callers must parse it. */
export async function callRpc(
  client: SupabaseClient,
  fn: string,
  args?: Record<string, unknown>,
): Promise<{ data: unknown; error: SupabaseErrorLike | null }> {
  const response = await client.rpc(fn, args);
  return { data: response.data as unknown, error: response.error };
}
