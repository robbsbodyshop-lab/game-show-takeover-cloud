import { Inset, Label } from '@/design';
import type { Team } from '@/engines/event';
import type { ConnectionStatus, PresenceEntry } from '@/realtime';
import { joinUrl, shortJoinAddress } from './joinLink';
import { PhoneRoster } from './PhoneRoster';
import { QrCanvas } from './QrCanvas';
import styles from './JoinPanel.module.css';

export interface JoinPanelProps {
  code: string | null;
  origin: string;
  status: ConnectionStatus;
  error: string | null;
  teams: readonly Team[];
  roster: readonly PresenceEntry[];
}

const STATUS_TEXT: Record<ConnectionStatus, string> = {
  connecting: 'Connecting phones...',
  connected: 'Phones can join',
  reconnecting: 'Reconnecting...',
  offline: 'Phones are offline',
  error: 'Phones are unavailable',
};

/** FR-020, FR-027: room code, QR link and the roster of connected phones. */
export const JoinPanel = ({ code, origin, status, error, teams, roster }: JoinPanelProps) => (
  <Inset className={styles.panel}>
    <Label>Phones join here</Label>
    {code ? (
      <>
        <QrCanvas value={joinUrl(origin, code)} size={288} />
        <p className={styles.address}>
          Go to <strong>{shortJoinAddress(origin)}</strong> and enter
        </p>
        <p className={styles.code} aria-label={`Room code ${code}`}>
          {code}
        </p>
      </>
    ) : (
      <p className={styles.address}>Opening the room...</p>
    )}
    <p className={styles.status} role="status">
      {error ? `Phones are unavailable: ${error}. Trying again.` : STATUS_TEXT[status]}
    </p>
    <PhoneRoster teams={teams} roster={roster} />
  </Inset>
);
