import { useRef } from 'react';
import { Button } from '@/design/Button';
import { Label } from '@/design/Label';
import type { ControlGroup, HostControl } from './hostControls';
import { TwoTapButton } from './TwoTapButton';
import styles from './ConsoleControls.module.css';

const GROUP_LABELS: Record<ControlGroup, string> = {
  flow: 'Next step',
  ruling: 'Rulings',
  round: 'Round tools',
  'fast-money': 'Fast Money tools',
  tools: 'Tools',
};
const GROUP_ORDER: readonly ControlGroup[] = ['flow', 'ruling', 'round', 'fast-money', 'tools'];

export interface ConsoleControlsProps {
  controls: readonly HostControl[];
  onSend: (control: HostControl, gameRev?: number) => void;
  /** The revision on screen right now, for two-tap buttons to remember at their first tap. */
  gameRev: number;
}

/** Buttons for the moment, grouped. A two-tap button carries the revision of its first tap. */
export const ConsoleControls = ({ controls, onSend, gameRev }: ConsoleControlsProps) => (
  <div className={styles.groups}>
    {GROUP_ORDER.map((group) => {
      const inGroup = controls.filter((control) => control.group === group);
      if (inGroup.length === 0) return null;
      return (
        <section key={group} className={styles.group} aria-label={GROUP_LABELS[group]}>
          <Label>{GROUP_LABELS[group]}</Label>
          <div className={styles.buttons}>
            {inGroup.map((control) =>
              control.confirmLabel === undefined ? (
                <Button
                  key={control.id}
                  variant={control.variant}
                  size="md"
                  onClick={() => {
                    onSend(control);
                  }}
                >
                  {control.hotkey === undefined ? control.label : `${control.label} (${control.hotkey})`}
                </Button>
              ) : (
                <ArmedButton key={control.id} control={control} gameRev={gameRev} onSend={onSend} />
              ),
            )}
          </div>
        </section>
      );
    })}
  </div>
);

interface ArmedButtonProps {
  control: HostControl;
  gameRev: number;
  onSend: (control: HostControl, gameRev?: number) => void;
}

const ArmedButton = ({ control, gameRev, onSend }: ArmedButtonProps) => {
  // The first tap remembers the revision on screen; if the game moved, the stage drops the second tap.
  const armedAt = useRef<number | null>(null);
  return (
    <TwoTapButton
      variant={control.variant}
      size="md"
      confirmLabel={control.confirmLabel ?? control.label}
      onArm={() => {
        armedAt.current = gameRev;
      }}
      onConfirm={() => {
        onSend(control, armedAt.current ?? gameRev);
        armedAt.current = null;
      }}
    >
      {control.label}
    </TwoTapButton>
  );
};
