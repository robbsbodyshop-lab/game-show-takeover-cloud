import { Badge } from '@/design/Badge';
import { Button } from '@/design/Button';
import { Inset } from '@/design/Inset';
import type { FeudContentView } from './types';
import styles from './ConsoleBrowser.module.css';

export interface ConsoleBrowserProps {
  content: FeudContentView;
  /** Questions can be swapped in right now. */
  canUse: boolean;
  onCommand: (name: string, args?: Record<string, unknown>) => void;
}

/** Fresh-content counts and the host-only question browser (HOST_FEATURE_INVENTORY.md 2.7). */
export const ConsoleBrowser = ({ content, canUse, onCommand }: ConsoleBrowserProps) => (
  <Inset className={styles.browser} role="region" aria-label="Question bank">
    <p className={styles.counts}>
      Fresh: {content.freshSurveys} of {content.totalSurveys} surveys, {content.freshFastMoney} of{' '}
      {content.totalFastMoney} Fast Money questions
      {content.runningLow && (
        <>
          {' '}
          <Badge tone="orange">Running low</Badge>
        </>
      )}
    </p>
    <Button
      variant="quiet"
      size="sm"
      aria-expanded={content.browser !== null}
      onClick={() => {
        onCommand('browse', { open: content.browser === null });
      }}
    >
      {content.browser === null ? 'Browse question bank' : 'Close question bank'}
    </Button>
    {content.browser !== null && (
      <ul className={styles.list}>
        {content.browser.map((entry) => (
          <li key={entry.id} className={styles.item}>
            <span className={styles.question}>
              {entry.question} <span className={styles.meta}>({entry.answers} answers)</span>
            </span>
            {entry.onBoard && <Badge tone="gold">On the board</Badge>}
            {entry.used && !entry.onBoard && <Badge tone="cream">Used</Badge>}
            <Button
              variant="host"
              size="sm"
              disabled={!canUse}
              aria-label={`Use for this round: ${entry.question}`}
              onClick={() => {
                onCommand('use-survey', { id: entry.id });
              }}
            >
              Use for this round
            </Button>
          </li>
        ))}
      </ul>
    )}
  </Inset>
);
