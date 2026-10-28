import { useState, type SyntheticEvent } from 'react';
import { Button, Inset, Marquee, Panel, Stripes } from '@/design';
import type { AuthService } from '@/data';
import { TextField } from './TextField';
import styles from './AuthScreen.module.css';

export interface AuthScreenProps {
  auth: AuthService;
  /** Demo mode offers a one-tap demo host (after an explicit sign-out). */
  onDemoSignIn?: () => Promise<void>;
}

type Mode = 'signin' | 'signup';

const MIN_PASSWORD = 6;
const validEmail = (email: string): boolean => /^\S+@\S+\.\S+$/.test(email.trim());

/** FR-001: sign up or sign in by email (password or magic link); errors are shown inline. */
export const AuthScreen = ({ auth, onDemoSignIn }: AuthScreenProps) => {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const emailProblem = (): string | null => (validEmail(email) ? null : 'Enter a valid email address.');

  const run = async (
    task: () => Promise<{ ok: true; session: unknown } | { ok: false; message: string }>,
  ) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await task();
      if (!result.ok) {
        setError(result.message);
      } else if (result.session === null) {
        setNotice(`Check ${email.trim()} for a link to finish signing in.`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: SyntheticEvent): void => {
    event.preventDefault();
    const problem = emailProblem();
    if (problem) {
      setError(problem);
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`Use a password of at least ${String(MIN_PASSWORD)} characters.`);
      return;
    }
    void run(() =>
      mode === 'signin'
        ? auth.signInWithPassword(email.trim(), password)
        : auth.signUp(email.trim(), password),
    );
  };

  const magicLink = (): void => {
    const problem = emailProblem();
    if (problem) {
      setError(problem);
      return;
    }
    void run(() => auth.signInWithMagicLink(email.trim()));
  };

  return (
    <main className={styles.page}>
      <Panel className={styles.panel}>
        <Marquee as="h1">Game Show Takeover</Marquee>
        <Stripes />
        <h2 className={styles.heading}>{mode === 'signin' ? 'Host sign in' : 'Create your host account'}</h2>
        <form className={styles.form} onSubmit={submit} noValidate>
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            disabled={busy}
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            disabled={busy}
          />
          {error ? (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className={styles.notice}>
              {notice}
            </p>
          ) : null}
          <Button type="submit" variant="primary" size="lg" disabled={busy}>
            {mode === 'signin' ? 'Sign in' : 'Sign up'}
          </Button>
        </form>
        <Inset className={styles.more}>
          <Button variant="tertiary" onClick={magicLink} disabled={busy}>
            Email me a sign-in link
          </Button>
          <Button
            variant="quiet"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError(null);
              setNotice(null);
            }}
            disabled={busy}
          >
            {mode === 'signin' ? 'New here? Sign up' : 'Have an account? Sign in'}
          </Button>
          {onDemoSignIn ? (
            <Button
              variant="host"
              onClick={() => {
                void run(async () => {
                  await onDemoSignIn();
                  return { ok: true, session: {} };
                });
              }}
              disabled={busy}
            >
              Continue as demo host
            </Button>
          ) : null}
        </Inset>
      </Panel>
    </main>
  );
};
