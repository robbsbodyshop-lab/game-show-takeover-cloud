import { Label } from '@/design';
import type { Team } from '@/engines/event';
import type { PresenceEntry } from '@/realtime';
import styles from './PhoneRoster.module.css';

export interface PhoneRosterProps {
  teams: readonly Team[];
  roster: readonly PresenceEntry[];
}

/** FR-027: connected phones per team, from presence. */
export const PhoneRoster = ({ teams, roster }: PhoneRosterProps) => {
  const phones = roster.filter((entry) => entry.role === 'phone');
  return (
    <section className={styles.roster} aria-label="Connected phones">
      <Label>Connected phones: {phones.length}</Label>
      <ul className={styles.list}>
        {teams.map((team) => {
          const mine = phones.filter((p) => p.team === team.id);
          return (
            <li key={team.id} className={styles.item} style={{ borderLeftColor: team.color }}>
              <span className={styles.team}>{team.name}</span>
              <span className={styles.count}>
                {mine.length === 0
                  ? 'waiting'
                  : mine.map((p) => (p.nickname === '' ? 'Phone' : p.nickname)).join(', ')}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
