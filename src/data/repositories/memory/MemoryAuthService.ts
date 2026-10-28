import type { AuthResult, AuthSession, AuthUser } from '../../types';
import type { AuthService } from '../AuthService';
import type { MemoryBackend, MemoryUser } from './memoryBackend';

const SESSION_SECONDS = 60 * 60;

function publicUser(user: MemoryUser): AuthUser {
  return { id: user.id, email: user.email, isAnonymous: user.isAnonymous };
}

/**
 * Demo / test auth. There is no email confirmation: sign-up and the "magic link" sign the user in
 * immediately, so the app is fully usable without a Supabase project.
 */
export function createMemoryAuthService(backend: MemoryBackend): AuthService {
  const emailKey = (email: string): string => email.trim().toLowerCase();

  const findByEmail = (email: string): MemoryUser | undefined =>
    [...backend.users.values()].find((u) => u.email === emailKey(email));

  const setSession = (user: MemoryUser | null): AuthSession | null => {
    backend.session = user
      ? { user: publicUser(user), expiresAt: Math.floor(backend.now() / 1000) + SESSION_SECONDS }
      : null;
    for (const listener of [...backend.listeners]) listener(backend.session);
    return backend.session;
  };

  const createUser = (email: string | null, password: string | null, isAnonymous: boolean): MemoryUser => {
    const user: MemoryUser = {
      id: backend.newId(),
      email: email === null ? null : emailKey(email),
      isAnonymous,
      password,
    };
    backend.users.set(user.id, user);
    return user;
  };

  return {
    signUp(email, password) {
      if (findByEmail(email))
        return Promise.resolve<AuthResult>({ ok: false, message: 'User already registered' });
      if (password.length < 6) {
        return Promise.resolve<AuthResult>({
          ok: false,
          message: 'Password should be at least 6 characters',
        });
      }
      return Promise.resolve<AuthResult>({
        ok: true,
        session: setSession(createUser(email, password, false)),
      });
    },

    signInWithPassword(email, password) {
      const user = findByEmail(email);
      if (user?.password !== password) {
        return Promise.resolve<AuthResult>({ ok: false, message: 'Invalid login credentials' });
      }
      return Promise.resolve<AuthResult>({ ok: true, session: setSession(user) });
    },

    signInWithMagicLink(email) {
      const user = findByEmail(email) ?? createUser(email, null, false);
      return Promise.resolve<AuthResult>({ ok: true, session: setSession(user) });
    },

    signInAnonymously() {
      return Promise.resolve<AuthResult>({ ok: true, session: setSession(createUser(null, null, true)) });
    },

    signOut() {
      setSession(null);
      return Promise.resolve();
    },

    getSession() {
      return Promise.resolve(backend.session);
    },

    onAuthStateChange(callback) {
      backend.listeners.add(callback);
      return () => {
        backend.listeners.delete(callback);
      };
    },

    currentUser() {
      return Promise.resolve(backend.session?.user ?? null);
    },
  };
}
