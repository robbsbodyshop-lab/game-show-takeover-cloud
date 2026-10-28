import { useEffect, useState } from 'react';
import type { DataLayer } from '@/data';
import { logger } from '@/lib/logger';

export type HostAuthStatus = 'loading' | 'signed-out' | 'signed-in';

export const DEMO_HOST_EMAIL = 'host@demo.local';

/**
 * Tracks the host's sign-in. In demo mode there is no real account, so a missing session is replaced
 * by an instant demo sign-in (the memory auth service signs in without a password).
 */
export function useHostAuth(data: Pick<DataLayer, 'auth' | 'mode'>): HostAuthStatus {
  const [status, setStatus] = useState<HostAuthStatus>('loading');

  useEffect(() => {
    let cancelled = false;
    const off = data.auth.onAuthStateChange((session) => {
      if (!cancelled) setStatus(session === null ? 'signed-out' : 'signed-in');
    });
    const start = async () => {
      try {
        const session = await data.auth.getSession();
        if (cancelled) return;
        if (session !== null) {
          setStatus('signed-in');
        } else if (data.mode === 'demo') {
          await data.auth.signInWithMagicLink(DEMO_HOST_EMAIL);
        } else {
          setStatus('signed-out');
        }
      } catch (error) {
        logger.warn('[host] could not read the session', error);
        if (!cancelled) setStatus('signed-out');
      }
    };
    void start();
    return () => {
      cancelled = true;
      off();
    };
  }, [data]);

  return status;
}
