import { Button } from '@/design';
import styles from './PhoneFooter.module.css';

export interface PhoneFooterProps {
  onChangeTeam: () => void;
  onChangeRoom: () => void;
}

export const PhoneFooter = ({ onChangeTeam, onChangeRoom }: PhoneFooterProps) => (
  <footer className={styles.footer}>
    <Button variant="quiet" onClick={onChangeTeam}>
      Change team
    </Button>
    <Button variant="quiet" onClick={onChangeRoom}>
      Change room
    </Button>
  </footer>
);
