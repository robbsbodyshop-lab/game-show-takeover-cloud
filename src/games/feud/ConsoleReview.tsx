import { useState } from 'react';
import { Button } from '@/design/Button';
import { Inset } from '@/design/Inset';
import { Label } from '@/design/Label';
import type { BoardSlot } from '@/engines/feud/types';
import type { PendingReview } from './types';
import styles from './ConsoleReview.module.css';

export interface ConsoleReviewProps {
  review: PendingReview & { suggestedAnswer: string | null };
  board: readonly BoardSlot[];
  teamName: string;
  onCommand: (name: string, args?: Record<string, unknown>) => void;
}

/** A near miss or spoken answer waits for the host: accept the suggestion, pick another, or call it a miss. */
export const ConsoleReview = ({ review, board, teamName, onCommand }: ConsoleReviewProps) => {
  const [other, setOther] = useState('');
  return (
    <Inset className={styles.review} role="region" aria-label="Host review">
      <Label>Host review ({review.source})</Label>
      <p className={styles.heard}>
        {teamName} said: <strong>{review.text}</strong>
      </p>
      <div className={styles.buttons}>
        {review.suggestedSlot !== null && (
          <Button
            variant="confirm"
            onClick={() => {
              onCommand('review-accept', { slot: review.suggestedSlot });
            }}
          >
            {`Accept as #${(review.suggestedSlot + 1).toString()} ${review.suggestedAnswer ?? ''}`}
          </Button>
        )}
        <Button
          variant="danger"
          onClick={() => {
            onCommand('review-miss');
          }}
        >
          {review.role === 'steal' ? 'Steal fails' : 'Not on the board (X)'}
        </Button>
        <Button
          variant="quiet"
          onClick={() => {
            onCommand('review-ignore');
          }}
        >
          Not an answer, ask again
        </Button>
        {review.role === 'control' && (
          <Button
            variant="quiet"
            onClick={() => {
              onCommand('review-repeat');
            }}
          >
            Already up, ask again
          </Button>
        )}
      </div>
      <div className={styles.other}>
        <Label htmlFor="review-other">Another answer</Label>
        <select
          id="review-other"
          className={styles.select}
          value={other}
          onChange={(event) => {
            setOther(event.target.value);
          }}
        >
          <option value="">Pick one...</option>
          {board.map((slot, index) => (
            <option key={index} value={index}>
              {`#${(index + 1).toString()} ${slot.answer}${slot.revealed ? ' (already up)' : ''}`}
            </option>
          ))}
        </select>
        <Button
          variant="host"
          size="sm"
          disabled={other === ''}
          onClick={() => {
            onCommand('review-accept', { slot: Number(other) });
          }}
        >
          Accept that one
        </Button>
      </div>
    </Inset>
  );
};
