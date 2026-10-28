import { Marquee, Stripes } from '@/design';
import { GAME_TITLE } from './constants';
import type { PuzzleController } from './controller';
import { TITLE_ITEMS } from './controller';
import { PuzzleTile } from './PuzzleTile';
import styles from './TitleScreen.module.css';
import { SpriteIcon } from './SpriteIcon';
import type { SpriteId } from './sprites';

const TILES: Record<(typeof TITLE_ITEMS)[number], { title: string; subtitle: string; icon: SpriteId }> = {
  '1p': { title: '1 Player', subtitle: 'Clear every germ', icon: 'germ-1-a' },
  '2p': { title: '2 Players', subtitle: 'Versus: first to 3 rounds', icon: 'germ-3-a' },
  back: { title: 'Back', subtitle: 'Return to the hub', icon: 'germ-2-hit' },
};

export interface TitleScreenProps {
  controller: PuzzleController;
  cursor: number;
  showHints: boolean;
}

export const TitleScreen = ({ controller, cursor, showHints }: TitleScreenProps) => (
  <section className={styles.screen} aria-label={`${GAME_TITLE} title`} data-testid="puzzle-title">
    <Marquee as="h1" className={styles.marquee}>
      {GAME_TITLE}
    </Marquee>
    <Stripes className={styles.stripes} />
    <div role="listbox" aria-label="Main menu" className={styles.menu}>
      {TITLE_ITEMS.map((item, index) => (
        <div key={item} className={styles.row}>
          <span className={styles.cursorSlot}>
            {index === cursor ? <SpriteIcon id="cursor-heart" scale={3} /> : null}
          </span>
          <PuzzleTile
            title={TILES[item].title}
            subtitle={TILES[item].subtitle}
            icon={TILES[item].icon}
            cursors={index === cursor ? [0] : []}
            markers={false}
            testId={`title-${item}`}
            className={styles.tile}
            onClick={() => {
              controller.selectTitle(index);
            }}
          />
        </div>
      ))}
    </div>
    {showHints ? (
      <p className={styles.hint}>W / S or arrows to move, Space or Enter to choose, Esc to go back</p>
    ) : null}
  </section>
);
