import { useState } from 'react';
import { Badge } from '@/design';
import { DEFAULT_TEAM_COLORS, type TeamEdit } from '@/engines/event';
import { parsePlayers } from './teamsValidation';
import { TextField } from './TextField';
import styles from './TeamRow.module.css';

export interface TeamRowProps {
  /** 1-based place, which is also the team id. */
  place: number;
  edit: TeamEdit;
  error: string | null;
  onChange: (edit: TeamEdit) => void;
}

export const TeamRow = ({ place, edit, error, onChange }: TeamRowProps) => {
  const [playersText, setPlayersText] = useState(edit.players.join(', '));
  return (
    <li className={styles.row}>
      <Badge tone="gold" className={styles.place}>
        {place}
      </Badge>
      <TextField
        label={`Team ${String(place)} name`}
        value={edit.name}
        error={error}
        maxLength={60}
        onChange={(name) => {
          onChange({ ...edit, name });
        }}
        className={styles.name}
      />
      <div className={styles.colors} role="radiogroup" aria-label={`Team ${String(place)} colour`}>
        {DEFAULT_TEAM_COLORS.map((color, index) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={edit.color === color}
            aria-label={`Colour ${String(index + 1)}`}
            className={styles.swatch}
            style={{ backgroundColor: color }}
            onClick={() => {
              onChange({ ...edit, color });
            }}
          />
        ))}
      </div>
      <TextField
        label={`Team ${String(place)} players`}
        value={playersText}
        placeholder="Ann, Bob (optional)"
        onChange={(text) => {
          setPlayersText(text);
          onChange({ ...edit, players: parsePlayers(text) });
        }}
        className={styles.players}
      />
    </li>
  );
};
