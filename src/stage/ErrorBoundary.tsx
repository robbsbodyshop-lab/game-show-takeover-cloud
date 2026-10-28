import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Marquee, Panel } from '@/design';
import { logger } from '@/lib/logger';
import styles from './ErrorBoundary.module.css';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Label on the recovery button. */
  recoverLabel?: string;
  /** Runs before the screen is shown again (for example: back to the hub). */
  onRecover?: () => void;
}

interface ErrorBoundaryState {
  failed: boolean;
}

/** A crash in one screen must not take the show down: show a card with a way back (TD-008). */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('[stage] screen crashed', error, info.componentStack);
  }

  private readonly recover = (): void => {
    this.props.onRecover?.();
    this.setState({ failed: false });
  };

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <section className={styles.wrap} role="alert">
        <Panel className={styles.panel}>
          <Marquee as="h2">Something went wrong</Marquee>
          <p className={styles.text}>This screen hit a problem. Your scores are saved.</p>
          <Button variant="secondary" onClick={this.recover}>
            {this.props.recoverLabel ?? 'Recover'}
          </Button>
        </Panel>
      </section>
    );
  }
}
