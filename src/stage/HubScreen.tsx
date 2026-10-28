import { Marquee, MemoryCardMenu, Stripes } from '@/design';
import type { EventAction, EventSession } from '@/engines/event';
import { HUB_TILE_IDS, hubTiles, type HubTileId } from './hubTiles';
import type { StageDialog } from './stageDialog';
import styles from './HubScreen.module.css';

export interface HubScreenProps {
  eventName: string;
  session: EventSession;
  dispatch: (action: EventAction) => void;
  /** Injected randomness in [0, 1) for the seed a game starts from. */
  draw: () => number;
  onOpenDialog: (dialog: StageDialog) => void;
}

const isTileId = (id: string): id is HubTileId => (HUB_TILE_IDS as readonly string[]).includes(id);

/** The hub (HOST_FEATURE_INVENTORY.md 1.3): a memory-card menu of everything the host can run next. */
export const HubScreen = ({ eventName, session, dispatch, draw, onOpenDialog }: HubScreenProps) => {
  const seed = (): number => Math.floor(draw() * 2 ** 31);

  const select = (id: string): void => {
    if (!isTileId(id)) return;
    switch (id) {
      case 'order':
        dispatch({ type: 'START_DOORS' });
        return;
      case 'feud':
        dispatch({ type: 'START_GAME', kind: 'feud', instanceSeed: seed() });
        return;
      case 'wheel':
        dispatch({ type: 'START_GAME', kind: 'wheel', instanceSeed: seed() });
        return;
      case 'speed':
        dispatch({ type: 'START_SPEED' });
        return;
      case 'puzzle':
        dispatch({ type: 'START_PUZZLE' });
        return;
      case 'plinko':
        dispatch({ type: 'START_PLINKO' });
        return;
      case 'winner':
        dispatch({ type: 'ANNOUNCE_WINNER' });
        return;
      case 'teams':
        onOpenDialog('teams');
        return;
      case 'settings':
        onOpenDialog('settings');
        return;
      case 'credits':
        onOpenDialog('credits');
    }
  };

  return (
    <main className={styles.hub}>
      <Marquee as="h1">{eventName}</Marquee>
      <Stripes />
      <MemoryCardMenu
        label="Hub"
        items={hubTiles(session)}
        columns={3}
        onSelect={select}
        className={styles.menu}
      />
    </main>
  );
};
