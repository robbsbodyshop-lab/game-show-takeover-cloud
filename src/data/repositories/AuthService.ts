import type { AuthResult, AuthSession, AuthUser } from '../types';

export interface AuthService {
  signUp(email: string, password: string): Promise<AuthResult>;
  signInWithPassword(email: string, password: string): Promise<AuthResult>;
  /** Sends a sign-in link. `session` is null until the link is opened. */
  signInWithMagicLink(email: string): Promise<AuthResult>;
  /** Phones: a throwaway session so RLS and private channels have a user id. */
  signInAnonymously(): Promise<AuthResult>;
  signOut(): Promise<void>;
  getSession(): Promise<AuthSession | null>;
  /** Returns an unsubscribe function. The callback receives `null` on sign-out. */
  onAuthStateChange(callback: (session: AuthSession | null) => void): () => void;
  currentUser(): Promise<AuthUser | null>;
}
