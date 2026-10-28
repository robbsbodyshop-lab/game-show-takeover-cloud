import { useState, type SyntheticEvent } from 'react';
import { Button, Label, Panel } from '@/design';
import type { AuthService } from '@/data';
import styles from './HostPage.module.css';

export interface HostSignInProps {
  auth: AuthService;
}

/** Sign-in gate for the host view: email and password, or a magic link (FR-002). */
export const HostSignIn = ({ auth }: HostSignInProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => ReturnType<AuthService['signInWithPassword']>, okText?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      if (!result.ok) setMessage({ tone: 'error', text: result.message });
      else if (okText !== undefined && result.session === null) setMessage({ tone: 'info', text: okText });
    } catch {
      setMessage({ tone: 'error', text: 'Could not reach the sign-in service. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    void run(() => auth.signInWithPassword(email, password));
  };

  return (
    <main className={styles.page}>
      <Panel className={styles.gate}>
        <h1 className={styles.title}>Host sign in</h1>
        <form className={styles.form} onSubmit={onSubmit}>
          <div className={styles.field}>
            <Label htmlFor="host-email">Email</Label>
            <input
              id="host-email"
              className={styles.input}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              required
            />
          </div>
          <div className={styles.field}>
            <Label htmlFor="host-password">Password</Label>
            <input
              id="host-password"
              className={styles.input}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
            />
          </div>
          <div className={styles.row}>
            <Button type="submit" disabled={busy || email === '' || password === ''}>
              Sign in
            </Button>
            <Button
              variant="tertiary"
              disabled={busy || email === ''}
              onClick={() => {
                void run(() => auth.signInWithMagicLink(email), 'Check your email for the sign-in link.');
              }}
            >
              Email me a link
            </Button>
          </div>
          {message === null ? null : (
            <p className={message.tone === 'error' ? styles.error : styles.note} role="status">
              {message.text}
            </p>
          )}
        </form>
      </Panel>
    </main>
  );
};
