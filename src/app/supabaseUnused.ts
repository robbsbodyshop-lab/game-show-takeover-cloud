/**
 * Stand-in for `@supabase/storage-js` and `@supabase/functions-js` (see `resolve.alias` in
 * vite.config.ts). `supabase-js` imports both statically, which costs about 6 KB gzipped on the
 * phone (NFR-004), and this app uses neither Storage nor Edge Functions. The constructor and the
 * error classes are inert, so creating a client works; calling a feature throws a clear error.
 *
 * If the app ever needs Storage or Functions, delete the two aliases in vite.config.ts.
 */
const unavailable = (feature: string): never => {
  throw new Error(`Supabase ${feature} is not bundled in this app (see src/app/supabaseUnused.ts)`);
};

export class StorageClient {
  from(): never {
    return unavailable('Storage');
  }
}
export class StorageApiError extends Error {}

export class FunctionsClient {
  invoke(): never {
    return unavailable('Functions');
  }
  setAuth(): void {
    // The client forwards the session token here; there is nothing to authorise.
  }
}
export class FunctionsError extends Error {}
export class FunctionsFetchError extends FunctionsError {}
export class FunctionsHttpError extends FunctionsError {}
export class FunctionsRelayError extends FunctionsError {}
export const FunctionRegion = {};
