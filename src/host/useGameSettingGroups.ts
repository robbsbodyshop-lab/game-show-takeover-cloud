import { useCallback, useEffect, useRef, useState } from 'react';
import type { DataLayer } from '@/data';
import { logger } from '@/lib/logger';
import {
  loadGameSettings,
  parseGameGroup,
  readCachedGameSettings,
  saveGameGroup,
  writeCachedGameGroup,
  type GameSettingGroups,
  type GameSettingsGroupName,
} from './gameSettings';

export interface UseGameSettingGroupsOptions {
  /** Called after a group reached the cloud copy (the host view tells the stage to re-read it). */
  onSaved?: () => void;
}

export interface UseGameSettingGroups extends GameSettingGroups {
  /** Parses `value` over the current group, applies it at once, caches it and saves it. */
  save: (group: GameSettingsGroupName, value: unknown) => void;
  /** Reads the cloud copy again (another surface saved). */
  reload: () => void;
}

/** The Feud and Wheel "next game" settings for the stage and the host view. Never throws. */
export function useGameSettingGroups(
  data: Pick<DataLayer, 'settings'>,
  options: UseGameSettingGroupsOptions = {},
): UseGameSettingGroups {
  const [groups, setGroups] = useState<GameSettingGroups>(readCachedGameSettings);
  const latest = useRef(groups);
  const alive = useRef(true);
  const saving = useRef(0);
  const onSaved = useRef(options.onSaved);
  useEffect(() => {
    onSaved.current = options.onSaved;
  });

  const reload = useCallback(() => {
    loadGameSettings(data, latest.current)
      .then((loaded) => {
        // A save still in flight carries newer values than the copy that was just read.
        if (!alive.current || saving.current > 0) return;
        writeCachedGameGroup('feud', loaded.feud);
        writeCachedGameGroup('wheel', loaded.wheel);
        if (JSON.stringify(loaded) === JSON.stringify(latest.current)) return;
        latest.current = loaded;
        setGroups(loaded);
      })
      .catch((error: unknown) => {
        logger.warn('[settings] game settings load failed, using the cached copy', error);
      });
  }, [data]);

  useEffect(() => {
    alive.current = true;
    reload();
    return () => {
      alive.current = false;
    };
  }, [reload]);

  const save = useCallback(
    (group: GameSettingsGroupName, value: unknown) => {
      const parsed =
        group === 'feud'
          ? parseGameGroup('feud', value, latest.current.feud)
          : parseGameGroup('wheel', value, latest.current.wheel);
      const next: GameSettingGroups = { ...latest.current, [group]: parsed };
      latest.current = next;
      setGroups(next);
      saving.current += 1;
      saveGameGroup(data, group, parsed).then(
        () => {
          saving.current -= 1;
          onSaved.current?.();
        },
        (error: unknown) => {
          saving.current -= 1;
          logger.warn('[settings] game settings save failed', error);
        },
      );
    },
    [data],
  );

  return { feud: groups.feud, wheel: groups.wheel, save, reload };
}
