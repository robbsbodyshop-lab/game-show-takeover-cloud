import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A recording stand-in for SupabaseClient: query-builder chains and rpc() calls are captured as
 * data and answered by a responder, so tests can assert table names, columns, filters and RPC
 * argument names without a network.
 */

export interface FakeResponse {
  data: unknown;
  error: { message: string; code?: string; status?: number } | null;
}

export interface Step {
  method: string;
  args: unknown[];
}

export interface RecordedCall {
  /** `from:<table>` or `rpc:<name>`. */
  target: string;
  /** Chained builder methods in order (empty for rpc). */
  steps: Step[];
  /** The rpc argument object, when target is an rpc. */
  rpcArgs?: unknown;
}

export type Responder = (call: RecordedCall) => FakeResponse;

const BUILDER_METHODS = [
  'select',
  'insert',
  'update',
  'upsert',
  'delete',
  'eq',
  'order',
  'single',
  'maybeSingle',
] as const;

export const ok = (data: unknown): FakeResponse => ({ data, error: null });
export const fail = (message: string, code?: string): FakeResponse => ({
  data: null,
  error: code === undefined ? { message } : { message, code },
});

export interface FakeAuth {
  signUp: (credentials: unknown) => Promise<unknown>;
  signInWithPassword: (credentials: unknown) => Promise<unknown>;
  signInWithOtp: (credentials: unknown) => Promise<unknown>;
  signInAnonymously: () => Promise<unknown>;
  signOut: () => Promise<unknown>;
  getSession: () => Promise<unknown>;
  onAuthStateChange: (callback: (event: string, session: unknown) => void) => unknown;
}

export interface FakeSupabase {
  client: SupabaseClient;
  calls: RecordedCall[];
}

export function createFakeSupabase(responder: Responder, auth: Partial<FakeAuth> = {}): FakeSupabase {
  const calls: RecordedCall[] = [];

  const from = (table: string): unknown => {
    const call: RecordedCall = { target: `from:${table}`, steps: [] };
    calls.push(call);
    const builder: Record<string, unknown> = {};
    for (const method of BUILDER_METHODS) {
      builder[method] = (...args: unknown[]) => {
        call.steps.push({ method, args });
        return builder;
      };
    }
    builder.then = (resolve: (value: FakeResponse) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(responder(call)).then(resolve, reject);
    return builder;
  };

  const rpc = (name: string, args?: unknown): Promise<FakeResponse> => {
    const call: RecordedCall = { target: `rpc:${name}`, steps: [], rpcArgs: args };
    calls.push(call);
    return Promise.resolve(responder(call));
  };

  const client = { from, rpc, auth } as unknown as SupabaseClient;
  return { client, calls };
}
