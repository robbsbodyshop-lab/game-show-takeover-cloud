import { useId } from 'react';
import { Label } from '@/design';
import styles from './GameSettingsFields.module.css';

export interface GameSettingChoice<T extends string | number> {
  value: T;
  label: string;
}

export interface GameSettingSelectProps<T extends string | number> {
  label: string;
  value: T;
  choices: readonly GameSettingChoice<T>[];
  onPick: (value: T) => void;
}

/** A labelled choice list; a saved value that is not offered (an older save) is still shown. */
export const GameSettingSelect = <T extends string | number>({
  label,
  value,
  choices,
  onPick,
}: GameSettingSelectProps<T>) => {
  const id = useId();
  const offered = choices.some((choice) => choice.value === value)
    ? choices
    : [...choices, { value, label: String(value) }];
  return (
    <div className={styles.field}>
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className={styles.select}
        value={String(value)}
        onChange={(event) => {
          const picked = offered.find((choice) => String(choice.value) === event.target.value);
          if (picked !== undefined) onPick(picked.value);
        }}
      >
        {offered.map((choice) => (
          <option key={String(choice.value)} value={String(choice.value)}>
            {choice.label}
          </option>
        ))}
      </select>
    </div>
  );
};
