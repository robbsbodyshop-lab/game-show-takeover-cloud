import { Inset, Label } from '@/design';
import type { WheelHostData } from './hostData';
import styles from './WheelConsole.module.css';

/** What the team phones are being told right now (FR-023), for the host's eyes. */
export const ConsolePhones = ({ data }: { data: WheelHostData }) => {
  const p = data.phone;
  const name = (id: number): string => data.teams.find((t) => t.id === id)?.name ?? String(id);
  return (
    <div className={styles.group}>
      <Label>Phone podiums</Label>
      <Inset className={styles.meta} data-testid="console-phones">
        <div>
          {p.activeTeam === null ? 'No team at the wheel' : `Active: ${p.turnName || name(p.activeTeam)}`}
          {' | '}BUY {p.canBuy ? 'on' : 'off'} | SPIN {p.canSpin ? 'on' : 'off'} | SOLVE{' '}
          {p.canSolve ? 'on' : 'off'}
        </div>
        {p.buzzTeams ? (
          <div>May buzz: {p.buzzTeams.length > 0 ? p.buzzTeams.map(name).join(', ') : 'nobody yet'}</div>
        ) : null}
        {p.offLabel ? <div>Phones say: {p.offLabel}</div> : null}
      </Inset>
    </div>
  );
};
