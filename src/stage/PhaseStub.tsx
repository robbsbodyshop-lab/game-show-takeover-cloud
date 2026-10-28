import type { ReactNode } from 'react';
import { Button, Marquee, Panel } from '@/design';
import styles from './PhaseStub.module.css';

export interface PhaseStubProps {
  /** Name of the screen that will replace this stub. */
  phase: string;
  onBackToHub: () => void;
  children?: ReactNode;
}

/**
 * Stand-in for a game or finale screen that is not wired into the stage yet. Shows the phase name
 * and a way back, so the event flow can be exercised end to end.
 */
export const PhaseStub = ({ phase, onBackToHub, children }: PhaseStubProps) => (
  <section className={styles.stub} aria-label={`${phase} screen`}>
    <Panel className={styles.panel}>
      <Marquee as="h2">{phase}</Marquee>
      <p className={styles.note}>This screen is not connected yet.</p>
      {children}
      <Button variant="secondary" onClick={onBackToHub}>
        Back to hub
      </Button>
    </Panel>
  </section>
);
