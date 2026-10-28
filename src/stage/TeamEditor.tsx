import { Button, NumberDisplay } from '@/design';
import { DEFAULT_TEAM_COLORS, MAX_TEAMS, MIN_TEAMS, type TeamEdit } from '@/engines/event';
import { TeamRow } from './TeamRow';
import type { TeamsValidation } from './teamsValidation';
import styles from './TeamEditor.module.css';

export interface TeamEditorProps {
  value: TeamEdit[];
  validation: TeamsValidation;
  onChange: (next: TeamEdit[]) => void;
}

const nextName = (existing: readonly TeamEdit[]): string => {
  const taken = new Set(existing.map((t) => t.name.trim().toLowerCase()));
  for (let n = existing.length + 1; n < existing.length + MAX_TEAMS + 2; n += 1) {
    const candidate = `Team ${String(n)}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `Team ${String(existing.length + 1)}`;
};

/** FR-003: 2 to 8 teams, each with a name, one of the eight default colours, and optional players. */
export const TeamEditor = ({ value, validation, onChange }: TeamEditorProps) => (
  <div className={styles.editor}>
    <div className={styles.count}>
      <span id="team-count-label" className={styles.countLabel}>
        Number of teams
      </span>
      <Button
        size="sm"
        variant="quiet"
        aria-label="Remove a team"
        disabled={value.length <= MIN_TEAMS}
        onClick={() => {
          onChange(value.slice(0, -1));
        }}
      >
        -
      </Button>
      <NumberDisplay value={value.length} size="md" aria-labelledby="team-count-label" />
      <Button
        size="sm"
        variant="quiet"
        aria-label="Add a team"
        disabled={value.length >= MAX_TEAMS}
        onClick={() => {
          onChange([
            ...value,
            {
              name: nextName(value),
              color: DEFAULT_TEAM_COLORS[value.length] ?? DEFAULT_TEAM_COLORS[0] ?? '#ffffff',
              players: [],
            },
          ]);
        }}
      >
        +
      </Button>
    </div>
    {validation.countError ? (
      <p role="alert" className={styles.error}>
        {validation.countError}
      </p>
    ) : null}
    <ol className={styles.rows} aria-label="Teams">
      {value.map((edit, index) => (
        <TeamRow
          // The list place is the identity (scores stay with a place, not a name).
          key={index}
          place={index + 1}
          edit={edit}
          error={validation.nameErrors[index] ?? null}
          onChange={(next) => {
            onChange(value.map((e, i) => (i === index ? next : e)));
          }}
        />
      ))}
    </ol>
  </div>
);
