import { useState } from 'react';
import { Button, Inset, Label } from '@/design';
import type { WheelSettings } from './settings';
import { TURN_TIMER_CHOICES } from './settings';
import type { ConsoleSectionProps } from './consoleTypes';
import styles from './WheelConsole.module.css';

/** The live turn timer and the form for the next game (inventory 5.2). */
export const ConsoleSettings = ({ data, send }: ConsoleSectionProps) => {
  const saved = data.nextSettings;
  const [draft, setDraft] = useState<WheelSettings>(saved);
  const [lastSaved, setLastSaved] = useState(JSON.stringify(saved));
  // A saved copy from elsewhere (another host view) replaces an untouched draft.
  if (JSON.stringify(saved) !== lastSaved) {
    setLastSaved(JSON.stringify(saved));
    setDraft(saved);
  }
  const patch = (change: Partial<WheelSettings>) => {
    setDraft({ ...draft, ...change });
  };
  return (
    <div className={styles.group}>
      <Label>Turn timer (live)</Label>
      <Inset className={styles.tools} role="group" aria-label="Turn timer">
        {TURN_TIMER_CHOICES.map((sec) => (
          <Button
            key={sec}
            variant={data.settings.turnTimerSec === sec ? 'confirm' : 'quiet'}
            aria-pressed={data.settings.turnTimerSec === sec}
            onClick={() => {
              send('set-turn-timer', { sec });
            }}
          >
            {sec === 0 ? 'Off' : `${String(sec)} s`}
          </Button>
        ))}
      </Inset>

      <Label>Next game</Label>
      <Inset className={styles.form}>
        <label className={styles.field}>
          Opening
          <select
            value={draft.opening}
            onChange={(e) => {
              patch({ opening: e.target.value === 'frenzy' ? 'frenzy' : 'classic' });
            }}
          >
            <option value="classic">$1,000 + $2,000 toss-ups</option>
            <option value="frenzy">Fortune Frenzy (30 s)</option>
          </select>
        </label>
        <label className={styles.field}>
          Speed-Up
          <select
            value={draft.speedUpStart}
            onChange={(e) => {
              patch({ speedUpStart: e.target.value === 'round4' ? 'round4' : 'bell' });
            }}
          >
            <option value="bell">Host rings the bell in Round 4</option>
            <option value="round4">Round 4 opens as the Speed-Up</option>
          </select>
        </label>
        <label className={styles.field}>
          Length
          <select
            value={draft.length}
            onChange={(e) => {
              patch({ length: e.target.value === 'short' ? 'short' : 'full' });
            }}
          >
            <option value="full">Full show</option>
            <option value="short">Short show</option>
          </select>
        </label>
        <label className={styles.field}>
          <input
            type="checkbox"
            checked={draft.bonusRound}
            onChange={(e) => {
              patch({ bonusRound: e.target.checked });
            }}
          />
          Play the Bonus Round
        </label>
        <Button
          variant="primary"
          onClick={() => {
            send('save-settings', {
              opening: draft.opening,
              speedUpStart: draft.speedUpStart,
              length: draft.length,
              bonusRound: draft.bonusRound,
            });
          }}
        >
          Save for the next game
        </Button>
      </Inset>
    </div>
  );
};
