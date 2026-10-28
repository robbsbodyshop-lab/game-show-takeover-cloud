import { Button, Dialog } from '@/design';
import styles from './CreditsDialog.module.css';

export interface CreditsDialogProps {
  open: boolean;
  version: string;
  onClose: () => void;
}

export const CreditsDialog = ({ open, version, onClose }: CreditsDialogProps) => (
  <Dialog open={open} onClose={onClose} title="Credits">
    <div className={styles.body}>
      <p>Game Show Takeover {version}</p>
      <p>
        A live, host-run team game show for the browser: Family Feud, Wheel of Fortune, a Speed Round, Plinko
        and a puzzle game, with teams joining from their phones.
      </p>
      <p>
        All artwork, music and sound cues are original to this project. Pixel type: Press Start 2P, Pixelify
        Sans and Silkscreen, used under the SIL Open Font License.
      </p>
      <p>Built with React, Supabase and qrcode.</p>
    </div>
    <Button variant="secondary" onClick={onClose}>
      Close
    </Button>
  </Dialog>
);
