import type { EventAction, EventSession } from '@/engines/event';
import type { FeudSettings } from '@/games/feud/settings';
import type { WheelSettings } from '@/games/wheel/settings';
import type { GameSettingsGroupName } from '@/host/gameSettings';
import { CreditsDialog } from './CreditsDialog';
import { EditTeamsDialog } from './EditTeamsDialog';
import { SettingsDialog } from './SettingsDialog';
import type { StageDialog } from './stageDialog';
import type { StageSettings } from './stageSettings';

export interface StageDialogsProps {
  dialog: StageDialog | null;
  session: EventSession;
  dispatch: (action: EventAction) => void;
  settings: StageSettings;
  version: string;
  onSettings: (patch: Partial<StageSettings>) => void;
  gameSettings?: { feud: FeudSettings; wheel: WheelSettings } | undefined;
  onSaveGameSettings?:
    ((group: GameSettingsGroupName, value: FeudSettings | WheelSettings) => void) | undefined;
  onClose: () => void;
  onResetScores: () => void;
  onNewEvent: () => void;
  onBackToEvents: () => void;
  onSignOut: () => void;
}

/** Mounted only while open, so each dialog starts from the current session. */
export const StageDialogs = ({
  dialog,
  session,
  dispatch,
  settings,
  version,
  onSettings,
  gameSettings,
  onSaveGameSettings,
  onClose,
  onResetScores,
  onNewEvent,
  onBackToEvents,
  onSignOut,
}: StageDialogsProps) => {
  switch (dialog) {
    case 'settings':
      return (
        <SettingsDialog
          open
          phase={session.phase}
          settings={settings}
          onChange={onSettings}
          gameSettings={gameSettings}
          onSaveGameSettings={onSaveGameSettings}
          onClose={onClose}
          onResetScores={onResetScores}
          onNewEvent={onNewEvent}
          onBackToEvents={onBackToEvents}
          onSignOut={onSignOut}
        />
      );
    case 'credits':
      return <CreditsDialog open version={version} onClose={onClose} />;
    case 'teams':
      return <EditTeamsDialog open session={session} dispatch={dispatch} onClose={onClose} />;
    case null:
      return null;
  }
};
