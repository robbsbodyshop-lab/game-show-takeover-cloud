import { useEffect, useRef, useState } from 'react';
import { Button, type ButtonProps } from '@/design/Button';
import { FEUD_TIMING } from './timing';

export interface TwoTapButtonProps extends Omit<ButtonProps, 'onClick'> {
  /** What the armed button says ("Tap again: skip Fast Money"). */
  confirmLabel: string;
  onConfirm: () => void;
  /** Called when the first tap arms the button (a console stamps the revision here). */
  onArm?: () => void;
}

/** A destructive button that needs two taps within a few seconds (FR-019, FR-036). */
export const TwoTapButton = ({ confirmLabel, onConfirm, onArm, children, ...rest }: TwoTapButtonProps) => {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const onClick = (): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    if (armed) {
      setArmed(false);
      onConfirm();
      return;
    }
    setArmed(true);
    onArm?.();
    timer.current = setTimeout(() => {
      timer.current = null;
      setArmed(false);
    }, FEUD_TIMING.confirmWindowMs);
  };

  return (
    <Button {...rest} onClick={onClick} data-armed={armed ? 'true' : 'false'}>
      {armed ? confirmLabel : children}
    </Button>
  );
};
