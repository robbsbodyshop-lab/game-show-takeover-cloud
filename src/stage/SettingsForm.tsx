import { Button, Inset, Label } from '@/design';
import type { GamePhase } from '@/engines/event';
import type { FeudSettings } from '@/games/feud/settings';
import type { WheelSettings } from '@/games/wheel/settings';
import { GameSettingsFields } from '@/host/GameSettingsFields';
import type { GameSettingsGroupName } from '@/host/gameSettings';
import { SettingToggle } from './SettingToggle';
import type { StageSettings } from './stageSettings';
import { useConfirmTwice } from './useConfirmTwice';
import styles from './SettingsForm.module.css';

export interface SettingsFormProps {
  phase: GamePhase;
  settings: StageSettings;
  onChange: (patch: Partial<StageSettings>) => void;
  /** The Feud and Wheel "next game" settings; the two sections are hidden unless both props are given. */
  gameSettings?: { feud: FeudSettings; wheel: WheelSettings } | undefined;
  onSaveGameSettings?:
    ((group: GameSettingsGroupName, value: FeudSettings | WheelSettings) => void) | undefined;
  onResetScores: () => void;
  onNewEvent: () => void;
  onBackToEvents: () => void;
  onSignOut: () => void;
}

const HOTKEYS: readonly [string, string][] = [
  ['F2', 'Host tools drawer'],
  ['F8', 'Pause / resume (Escape also resumes)'],
  ['F9', 'Show mode'],
  ['1 to 8', 'Buzz for that team'],
];

/** The stage settings: sound, display, hotkeys and the event buttons. Shared by the dialog and the F2 drawer. */
export const SettingsForm = ({
  phase,
  settings,
  onChange,
  gameSettings,
  onSaveGameSettings,
  onResetScores,
  onNewEvent,
  onBackToEvents,
  onSignOut,
}: SettingsFormProps) => {
  const reset = useConfirmTwice(onResetScores);
  const fresh = useConfirmTwice(onNewEvent);
  return (
    <div className={styles.form}>
      <Inset className={styles.group}>
        <Label>Sound</Label>
        <SettingToggle
          label="Music"
          on={settings.musicOn}
          onToggle={() => {
            onChange({ musicOn: !settings.musicOn });
          }}
        />
        <label className={styles.volume}>
          <span>Volume</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(settings.volume * 100)}
            aria-label="Volume"
            onChange={(event) => {
              onChange({ volume: Number(event.target.value) / 100 });
            }}
          />
        </label>
      </Inset>
      <Inset className={styles.group}>
        <Label>Display</Label>
        <SettingToggle
          label="Show mode"
          hint="Hides the sidebar and host buttons (F9)"
          on={settings.showMode}
          onToggle={() => {
            onChange({ showMode: !settings.showMode });
          }}
        />
        <SettingToggle
          label="CRT curve"
          on={settings.crt}
          onToggle={() => {
            onChange({ crt: !settings.crt });
          }}
        />
        <SettingToggle
          label="Verbose logging"
          hint="Writes debug messages to the browser console"
          on={settings.verbose}
          onToggle={() => {
            onChange({ verbose: !settings.verbose });
          }}
        />
      </Inset>
      {gameSettings !== undefined && onSaveGameSettings !== undefined ? (
        <GameSettingsFields feud={gameSettings.feud} wheel={gameSettings.wheel} onSave={onSaveGameSettings} />
      ) : null}
      <Inset className={styles.group}>
        <Label>Hotkeys</Label>
        <dl className={styles.keys}>
          {HOTKEYS.map(([key, what]) => (
            <div key={key} className={styles.key}>
              <dt>{key}</dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      </Inset>
      <Inset className={styles.group}>
        <Label>Event</Label>
        <div className={styles.buttons}>
          <Button variant="danger" size="sm" disabled={phase === 'setup'} onClick={reset.trigger}>
            {reset.armed ? 'Tap again: zero all scores and chips' : 'Reset scores & chips'}
          </Button>
          <Button variant="danger" size="sm" onClick={fresh.trigger}>
            {fresh.armed ? 'Tap again: start over with these teams' : 'Start a new event'}
          </Button>
          <Button variant="quiet" size="sm" onClick={onBackToEvents}>
            Back to my events
          </Button>
          <Button variant="quiet" size="sm" onClick={onSignOut}>
            Sign out
          </Button>
        </div>
      </Inset>
    </div>
  );
};
