import { Inset, Label } from '@/design';
import type { FeudSettings } from '@/games/feud/settings';
import type { WheelSettings } from '@/games/wheel/settings';
import type { GameSettingsGroupName } from './gameSettings';
import { GameSettingSelect, type GameSettingChoice } from './GameSettingSelect';
import styles from './GameSettingsFields.module.css';

export interface GameSettingsFieldsProps {
  feud: FeudSettings;
  wheel: WheelSettings;
  /** Called with the whole group after every change; the caller saves it. */
  onSave: (group: GameSettingsGroupName, value: FeudSettings | WheelSettings) => void;
}

const WINNING_SCORES: readonly GameSettingChoice<FeudSettings['targetScore']>[] = [
  { value: 200, label: '200' },
  { value: 300, label: '300' },
  { value: 400, label: '400' },
  { value: 500, label: '500' },
];
const FORMATS: readonly GameSettingChoice<FeudSettings['format']>[] = [
  { value: 'full', label: 'Full game' },
  { value: 'one-round', label: 'One round' },
];
const ANSWER_TIMERS: readonly GameSettingChoice<number>[] = [
  { value: 5, label: '5 seconds' },
  { value: 10, label: '10 seconds' },
  { value: 15, label: '15 seconds' },
];
const STEAL_HUDDLES: readonly GameSettingChoice<FeudSettings['stealTimerSec']>[] = [
  { value: 0, label: 'Untimed (host calls it)' },
  { value: 15, label: '15 seconds' },
  { value: 30, label: '30 seconds' },
];
const OPENINGS: readonly GameSettingChoice<WheelSettings['opening']>[] = [
  { value: 'classic', label: '$1,000 and $2,000 toss-ups' },
  { value: 'frenzy', label: 'Fortune Frenzy (30 s)' },
];
const SPEED_UPS: readonly GameSettingChoice<WheelSettings['speedUpStart']>[] = [
  { value: 'bell', label: 'Host rings the bell in Round 4' },
  { value: 'round4', label: 'Round 4 opens as the Speed-Up' },
];
const LENGTHS: readonly GameSettingChoice<WheelSettings['length']>[] = [
  { value: 'full', label: 'Full show' },
  { value: 'short', label: 'Short show' },
];
const TURN_TIMERS: readonly GameSettingChoice<WheelSettings['turnTimerSec']>[] = [
  { value: 0, label: 'Off' },
  { value: 5, label: '5 seconds' },
  { value: 10, label: '10 seconds' },
];

/**
 * The Family Feud and Wheel of Fortune "next game" settings, shared by the stage Settings (dialog and
 * F2 drawer) and the host view Settings. Each change saves the whole group; a game already running keeps
 * the rules it started with (the Feud answer and steal timers are the exception and apply at once).
 */
export const GameSettingsFields = ({ feud, wheel, onSave }: GameSettingsFieldsProps) => (
  <>
    <Inset className={styles.group} role="group" aria-label="Family Feud (next game)">
      <Label>Family Feud (next game)</Label>
      <GameSettingSelect
        label="Winning score"
        value={feud.targetScore}
        choices={WINNING_SCORES}
        onPick={(targetScore) => {
          onSave('feud', { ...feud, targetScore });
        }}
      />
      <GameSettingSelect
        label="Match format"
        value={feud.format}
        choices={FORMATS}
        onPick={(format) => {
          onSave('feud', { ...feud, format });
        }}
      />
      <label className={styles.field}>
        <input
          type="checkbox"
          checked={feud.fastMoneyEnabled}
          onChange={(event) => {
            onSave('feud', { ...feud, fastMoneyEnabled: event.target.checked });
          }}
        />
        Fast Money
      </label>
      <GameSettingSelect
        label="Answer timer"
        value={feud.answerTimerSec}
        choices={ANSWER_TIMERS}
        onPick={(answerTimerSec) => {
          onSave('feud', { ...feud, answerTimerSec });
        }}
      />
      <GameSettingSelect
        label="Steal huddle"
        value={feud.stealTimerSec}
        choices={STEAL_HUDDLES}
        onPick={(stealTimerSec) => {
          onSave('feud', { ...feud, stealTimerSec });
        }}
      />
    </Inset>
    <Inset className={styles.group} role="group" aria-label="Wheel of Fortune (next game)">
      <Label>Wheel of Fortune (next game)</Label>
      <GameSettingSelect
        label="Opening"
        value={wheel.opening}
        choices={OPENINGS}
        onPick={(opening) => {
          onSave('wheel', { ...wheel, opening });
        }}
      />
      <GameSettingSelect
        label="Speed-Up"
        value={wheel.speedUpStart}
        choices={SPEED_UPS}
        onPick={(speedUpStart) => {
          onSave('wheel', { ...wheel, speedUpStart });
        }}
      />
      <GameSettingSelect
        label="Length"
        value={wheel.length}
        choices={LENGTHS}
        onPick={(length) => {
          onSave('wheel', { ...wheel, length });
        }}
      />
      <label className={styles.field}>
        <input
          type="checkbox"
          checked={wheel.bonusRound}
          onChange={(event) => {
            onSave('wheel', { ...wheel, bonusRound: event.target.checked });
          }}
        />
        Bonus Round
      </label>
      <GameSettingSelect
        label="Turn timer"
        value={wheel.turnTimerSec}
        choices={TURN_TIMERS}
        onPick={(turnTimerSec) => {
          onSave('wheel', { ...wheel, turnTimerSec });
        }}
      />
    </Inset>
  </>
);
