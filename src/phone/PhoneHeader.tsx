import type { ConnectionStatus } from '@/realtime/RoomTransport';
import styles from './PhoneHeader.module.css';

export interface PhoneHeaderProps {
  teamName: string;
  teamColor: string;
  code: string;
  status: ConnectionStatus;
}

const STATUS_WORDS: Readonly<Record<ConnectionStatus, string>> = {
  connected: 'Live',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  offline: 'Offline',
  error: 'No connection',
};

/** Team colour band, team name, room code and a connection dot that also says it in words. */
export const PhoneHeader = ({ teamName, teamColor, code, status }: PhoneHeaderProps) => (
  <header className={styles.header}>
    <div className={styles.band} style={{ backgroundColor: teamColor }} aria-hidden="true" />
    <div className={styles.row}>
      <span className={styles.swatch} style={{ backgroundColor: teamColor }} aria-hidden="true" />
      <div className={styles.names}>
        <span className={styles.team}>{teamName}</span>
        <span className={styles.room}>Room {code}</span>
      </div>
      <span className={styles.conn} data-status={status}>
        <span className={styles.dot} aria-hidden="true" />
        {STATUS_WORDS[status]}
      </span>
    </div>
  </header>
);
