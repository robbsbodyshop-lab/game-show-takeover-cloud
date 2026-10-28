import { Button } from '@/design/Button';
import { Badge } from '@/design/Badge';
import type { RunCommand } from './FeudGame.types';
import { HostOnly } from './HostOnly';
import { TwoTapButton } from './TwoTapButton';
import type { FeudViewModel } from './types';
import styles from './HostBar.module.css';

export interface HostBarProps {
  view: FeudViewModel;
  showMode: boolean;
  onCommand: RunCommand;
}

/** The host's buttons for this moment. Hidden in show mode, back on hover (HOST_FEATURE_INVENTORY.md 2.3). */
export const HostBar = ({ view, showMode, onCommand }: HostBarProps) => (
  <HostOnly showMode={showMode} className={styles.bar}>
    {view.reviewPending && <Badge tone="host">Host review needed: open Host Tools (F2)</Badge>}
    {view.surveySays && <Badge tone="gold">Survey says... Enter shows it now</Badge>}
    {view.mic.status !== 'off' && (
      <Badge tone={view.mic.status === 'listening' ? 'confirm' : 'orange'}>{`Mic ${view.mic.status}`}</Badge>
    )}
    {view.controls.map((control) =>
      control.confirmLabel === undefined ? (
        <Button
          key={control.id}
          variant={control.variant}
          size="md"
          onClick={() => {
            onCommand(control.command, control.args);
          }}
          title={control.hotkey === undefined ? undefined : `Key: ${control.hotkey}`}
        >
          {control.label}
        </Button>
      ) : (
        <TwoTapButton
          key={control.id}
          variant={control.variant}
          size="md"
          confirmLabel={control.confirmLabel}
          onConfirm={() => {
            onCommand(control.command, control.args);
          }}
        >
          {control.label}
        </TwoTapButton>
      ),
    )}
  </HostOnly>
);
