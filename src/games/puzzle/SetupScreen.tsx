import { Marquee, Stripes } from '@/design';
import { GAME_TITLE } from './constants';
import type { PuzzleController } from './controller';
import { PlayerSetupPanel } from './PlayerSetupPanel';
import styles from './SetupScreen.module.css';
import type { SetupState } from './setup';

export interface SetupScreenProps {
  controller: PuzzleController;
  setup: SetupState;
  showHints: boolean;
}

export const SetupScreen = ({ controller, setup, showHints }: SetupScreenProps) => (
  <section className={styles.screen} aria-label={`${GAME_TITLE} setup`} data-testid="puzzle-setup">
    <Marquee as="h1" className={styles.marquee}>
      Choose level and speed
    </Marquee>
    <Stripes className={styles.stripes} />
    <div className={styles.panels} data-mode={setup.mode}>
      {setup.players.map((player, index) => (
        <PlayerSetupPanel
          key={index}
          controller={controller}
          player={index === 0 ? 0 : 1}
          setup={player}
          music={setup.music}
          showHints={showHints}
        />
      ))}
    </div>
    {showHints ? (
      <p className={styles.hint}>
        Move with your keys, press Space or Enter on a tile to choose it. Choose START when ready. Esc goes
        back.
      </p>
    ) : null}
  </section>
);
