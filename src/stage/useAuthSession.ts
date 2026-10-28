import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuthSession, AuthUser, DataLayer } from '@/data';

export type AuthState =
  { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: AuthUser };

export const DEMO_EMAIL = 'demo@host.local';
export const DEMO_PASSWORD = 'demo-host';

/** An anonymous session belongs to a phone, not a host, so the stage treats it as signed out. */
const toState = (session: AuthSession | null): AuthState =>
  session && !session.user.isAnonymous ? { status: 'signedIn', user: session.user } : { status: 'signedOut' };

export interface AuthSessionApi {
  state: AuthState;
  /** Demo mode only: signs in (creating it first) the shared demo host. */
  signInAsDemoHost: () => Promise<void>;
}

/**
 * Follows the auth state. In demo mode a signed-out visitor is signed in as a demo host once at
 * start; after an explicit sign-out the auth screen offers "Continue as demo host" instead.
 */
export function useAuthSession(data: DataLayer, demo: boolean): AuthSessionApi {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const triedDemo = useRef(false);

  const signInAsDemoHost = useCallback(async (): Promise<void> => {
    const signedIn = await data.auth.signInWithPassword(DEMO_EMAIL, DEMO_PASSWORD);
    if (signedIn.ok) return;
    await data.auth.signUp(DEMO_EMAIL, DEMO_PASSWORD);
  }, [data]);

  useEffect(() => {
    let active = true;
    const unsubscribe = data.auth.onAuthStateChange((session) => {
      if (active) setState(toState(session));
    });
    data.auth
      .getSession()
      .then(async (session) => {
        if (!active) return;
        if (session === null && demo && !triedDemo.current) {
          triedDemo.current = true;
          await signInAsDemoHost();
          return;
        }
        setState((prev) => (prev.status === 'loading' ? toState(session) : prev));
      })
      .catch(() => {
        if (active) setState((prev) => (prev.status === 'loading' ? { status: 'signedOut' } : prev));
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [data, demo, signInAsDemoHost]);

  return { state, signInAsDemoHost };
}
