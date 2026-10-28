import { Panel } from '@/design';
import type { Speed } from '@/engines/puzzle';
import type { MusicChoice } from './cues';
import type { PuzzleController } from './controller';
import styles from './PlayerSetupPanel.module.css';
import { PuzzleTile } from './PuzzleTile';
import { LEVELS_PER_ROW, MUSIC_CHOICES, SPEEDS, rowsFor } from './setup';
import type { PlayerSetup, SetupRow } from './setup';
import type { SpriteId } from './sprites';

const SPEED_TITLE: Record<Speed, string> = { low: 'LOW', med: 'MED', hi: 'HI' };
const SPEED_ICON: Record<Speed, SpriteId> = { low: 'germ-2-a', med: 'germ-1-a', hi: 'germ-3-a' };
const MUSIC_TITLE: Record<MusicChoice, string> = { a: 'MUSIC A', b: 'MUSIC B', off: 'OFF' };
const MUSIC_SUB: Record<MusicChoice, string> = { a: 'Upbeat', b: 'Chill', off: 'Silent' };

export interface PlayerSetupPanelProps {
  controller: PuzzleController;
  player: 0 | 1;
  setup: PlayerSetup;
  music: MusicChoice;
  showHints: boolean;
}

const ROW_LABEL: Record<SetupRow, string> = {
  'level-lo': 'Level (germs)',
  'level-hi': '',
  speed: 'Speed',
  music: 'Music',
  start: '',
};

export const PlayerSetupPanel = ({ controller, player, setup, music, showHints }: PlayerSetupPanelProps) => {
  const rows = rowsFor(player);
  const click = (row: number, col: number): void => {
    controller.setupAction({ type: 'click', player, row, col });
  };
  const own = (rowIndex: number, col: number): readonly (0 | 1)[] =>
    setup.row === rowIndex && setup.col === col ? [player] : [];

  return (
    <Panel
      className={styles.panel}
      data-testid={`setup-panel-${(player + 1).toString()}`}
      data-ready={setup.ready}
    >
      <h2 className={styles.heading} data-player={player}>
        Player {player + 1}
      </h2>
      {showHints ? (
        <p className={styles.keys}>{player === 0 ? 'W A S D + Space' : 'Arrows + Enter'}</p>
      ) : null}
      {rows.map((row, rowIndex) => (
        <div key={row} className={styles.group}>
          {ROW_LABEL[row] ? <p className={styles.label}>{ROW_LABEL[row]}</p> : null}
          <div
            role="listbox"
            aria-label={`${ROW_LABEL[row] || (row === 'level-hi' ? 'Level 11 to 20' : 'Start')} for player ${(player + 1).toString()}`}
            className={styles.tiles}
            data-row={row}
          >
            {row === 'level-lo' || row === 'level-hi'
              ? Array.from({ length: LEVELS_PER_ROW }, (_, col) => {
                  const level = (row === 'level-hi' ? LEVELS_PER_ROW : 0) + col + 1;
                  return (
                    <PuzzleTile
                      key={level}
                      compact
                      title={level.toString()}
                      selected={setup.level === level}
                      cursors={own(rowIndex, col)}
                      testId={`p${(player + 1).toString()}-level-${level.toString()}`}
                      onClick={() => {
                        click(rowIndex, col);
                      }}
                    />
                  );
                })
              : null}
            {row === 'speed'
              ? SPEEDS.map((speed, col) => (
                  <PuzzleTile
                    key={speed}
                    icon={SPEED_ICON[speed]}
                    title={SPEED_TITLE[speed]}
                    selected={setup.speed === speed}
                    cursors={own(rowIndex, col)}
                    testId={`p${(player + 1).toString()}-speed-${speed}`}
                    onClick={() => {
                      click(rowIndex, col);
                    }}
                  />
                ))
              : null}
            {row === 'music'
              ? MUSIC_CHOICES.map((choice, col) => (
                  <PuzzleTile
                    key={choice}
                    title={MUSIC_TITLE[choice]}
                    subtitle={MUSIC_SUB[choice]}
                    selected={music === choice}
                    cursors={own(rowIndex, col)}
                    testId={`music-${choice}`}
                    onClick={() => {
                      click(rowIndex, col);
                    }}
                  />
                ))
              : null}
            {row === 'start' ? (
              <PuzzleTile
                title={setup.ready ? 'READY' : 'START'}
                subtitle={setup.ready ? 'Waiting for the other player' : 'Press to get ready'}
                selected={setup.ready}
                cursors={own(rowIndex, 0)}
                testId={`p${(player + 1).toString()}-start`}
                className={styles.start}
                onClick={() => {
                  click(rowIndex, 0);
                }}
              />
            ) : null}
          </div>
        </div>
      ))}
    </Panel>
  );
};
