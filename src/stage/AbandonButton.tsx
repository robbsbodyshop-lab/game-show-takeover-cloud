import { Button } from '@/design';
import { useConfirmTwice } from './useConfirmTwice';

export interface AbandonButtonProps {
  onConfirm: () => void;
  className?: string;
}

/** FR-019: leaving a running game takes two taps; the first one changes the label. */
export const AbandonButton = ({ onConfirm, className }: AbandonButtonProps) => {
  const confirm = useConfirmTwice(onConfirm);
  return (
    <Button variant="danger" size="sm" className={className} onClick={confirm.trigger}>
      {confirm.armed ? 'Tap again: abandon, no scores' : 'Abandon game, back to hub'}
    </Button>
  );
};
