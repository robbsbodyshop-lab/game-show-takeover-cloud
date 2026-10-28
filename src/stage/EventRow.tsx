import { Badge, Button } from '@/design';
import type { EventRecord } from '@/data';
import { useConfirmTwice } from './useConfirmTwice';
import styles from './EventRow.module.css';

export interface EventRowProps {
  event: EventRecord;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

const STATUS_LABEL: Record<EventRecord['status'], string> = {
  setup: 'Setting up',
  live: 'In progress',
  finished: 'Finished',
};

export const EventRow = ({ event, onOpen, onDelete }: EventRowProps) => {
  const confirm = useConfirmTwice(() => {
    onDelete(event.id);
  });
  return (
    <li className={styles.row}>
      <div className={styles.info}>
        <span className={styles.name}>{event.name}</span>
        <span className={styles.meta}>
          <Badge tone={event.status === 'finished' ? 'gold' : 'info'}>{STATUS_LABEL[event.status]}</Badge>
          <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleDateString()}</time>
        </span>
      </div>
      <div className={styles.actions}>
        <Button
          variant="primary"
          onClick={() => {
            onOpen(event.id);
          }}
          aria-label={`Open ${event.name}`}
        >
          {event.status === 'finished' ? 'View' : 'Open'}
        </Button>
        <Button
          variant="danger"
          onClick={confirm.trigger}
          aria-label={confirm.armed ? `Tap again to delete ${event.name}` : `Delete ${event.name}`}
        >
          {confirm.armed ? 'Tap again: delete' : 'Delete'}
        </Button>
      </div>
    </li>
  );
};
