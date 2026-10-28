import { Button } from '@/design';
import styles from './StatusBanners.module.css';

export interface StatusBannersProps {
  /** Another stage is running this event (director lease lost). */
  readOnly: boolean;
  onReload: () => void;
  signedOut: boolean;
  saveFailing: boolean;
  reconnecting: boolean;
  showMode: boolean;
}

/** Notices across the top of the stage. In show mode only the critical one stays on the projector. */
export const StatusBanners = ({
  readOnly,
  onReload,
  signedOut,
  saveFailing,
  reconnecting,
  showMode,
}: StatusBannersProps) => (
  <div className={styles.stack}>
    {readOnly ? (
      <div className={styles.banner} data-tone="danger" role="alert">
        <span>Another stage is running this event. This screen is read-only.</span>
        {showMode ? null : (
          <Button size="sm" variant="secondary" onClick={onReload}>
            Reload this event
          </Button>
        )}
      </div>
    ) : null}
    {showMode ? null : (
      <>
        {signedOut ? (
          <div className={styles.banner} data-tone="warn" role="status">
            You are signed out. The show keeps running; sign in again when this game ends to keep saving.
          </div>
        ) : null}
        {saveFailing ? (
          <div className={styles.banner} data-tone="warn" role="status">
            Not saving right now. The show keeps running and will retry.
          </div>
        ) : null}
        {reconnecting ? (
          <div className={styles.banner} data-tone="warn" role="status">
            Phones are reconnecting...
          </div>
        ) : null}
      </>
    )}
  </div>
);
