import { Button } from '@/design';
import styles from './SettingToggle.module.css';

export interface SettingToggleProps {
  label: string;
  on: boolean;
  onToggle: () => void;
  hint?: string;
}

export const SettingToggle = ({ label, on, onToggle, hint }: SettingToggleProps) => (
  <div className={styles.row}>
    <div className={styles.text}>
      <span className={styles.label}>{label}</span>
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </div>
    <Button
      size="sm"
      variant={on ? 'confirm' : 'quiet'}
      aria-pressed={on}
      aria-label={`${label}: ${on ? 'on' : 'off'}`}
      onClick={onToggle}
    >
      {on ? 'On' : 'Off'}
    </Button>
  </div>
);
