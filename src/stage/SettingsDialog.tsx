import { Button, Dialog } from '@/design';
import type { GamePhase } from '@/engines/event';
import type { FeudSettings } from '@/games/feud/settings';
import type { WheelSettings } from '@/games/wheel/settings';
import type { GameSettingsGroupName } from '@/host/gameSettings';
import { SettingsForm } from './SettingsForm';
import type { StageSettings } from './stageSettings';
import styles from './SettingsDialog.module.css';

export interface SettingsDialogProps {
  open: boolean;
  phase: GamePhase;
  settings: StageSettings;
  onChange: (patch: Partial<StageSettings>) => void;
  gameSettings?: { feud: FeudSettings; wheel: WheelSettings } | undefined;
  onSaveGameSettings?:
    ((group: GameSettingsGroupName, value: FeudSettings | WheelSettings) => void) | undefined;
  onClose: () => void;
  onResetScores: () => void;
  onNewEvent: () => void;
  onBackToEvents: () => void;
  onSignOut: () => void;
}

export const SettingsDialog = ({
  open,
  phase,
  settings,
  onChange,
  gameSettings,
  onSaveGameSettings,
  onClose,
  onResetScores,
  onNewEvent,
  onBackToEvents,
  onSignOut,
}: SettingsDialogProps) => (
  <Dialog open={open} onClose={onClose} title="Settings" className={styles.dialog}>
    <SettingsForm
      phase={phase}
      settings={settings}
      onChange={onChange}
      gameSettings={gameSettings}
      onSaveGameSettings={onSaveGameSettings}
      onResetScores={onResetScores}
      onNewEvent={onNewEvent}
      onBackToEvents={onBackToEvents}
      onSignOut={onSignOut}
    />
    <Button variant="secondary" onClick={onClose}>
      Close
    </Button>
  </Dialog>
);
