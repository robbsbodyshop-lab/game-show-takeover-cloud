import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import type { AuthResult, AuthSession, AuthUser } from '../../types';
import type { AuthService } from '../AuthService';

function mapUser(user: User): AuthUser {
  return { id: user.id, email: user.email ?? null, isAnonymous: user.is_anonymous ?? false };
}

function mapSession(session: Session | null): AuthSession | null {
  return session ? { user: mapUser(session.user), expiresAt: session.expires_at ?? null } : null;
}

function result(response: {
  data: { session: Session | null };
  error: { message: string } | null;
}): AuthResult {
  if (response.error) return { ok: false, message: response.error.message };
  return { ok: true, session: mapSession(response.data.session) };
}

export function createSupabaseAuthService(client: SupabaseClient): AuthService {
  return {
    async signUp(email, password) {
      // With "confirm email" on, `session` is null until the link in the mail is opened.
      return result(await client.auth.signUp({ email, password }));
    },

    async signInWithPassword(email, password) {
      return result(await client.auth.signInWithPassword({ email, password }));
    },

    async signInWithMagicLink(email) {
      const { error } = await client.auth.signInWithOtp({ email });
      return error ? { ok: false, message: error.message } : { ok: true, session: null };
    },

    async signInAnonymously() {
      return result(await client.auth.signInAnonymously());
    },

    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },

    async getSession() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return mapSession(data.session);
    },

    onAuthStateChange(callback) {
      // The callback must stay synchronous: supabase-js can deadlock on awaited auth calls here.
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        callback(mapSession(session));
      });
      return () => {
        data.subscription.unsubscribe();
      };
    },

    async currentUser() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data.session ? mapUser(data.session.user) : null;
    },
  };
}
