import { useEffect, useState, useSyncExternalStore } from 'react';
import { FeudController } from './FeudController';
import type { FeudGameProps } from './FeudGame.types';
import { resolveMatch } from './match';
import { resolveFeudSettings } from './settings';
import type { FeudViewModel } from './types';

/** Builds the controller once per mounted game, wires its lifecycle to the component and reads it. */
export const useFeudController = (
  props: FeudGameProps,
): { controller: FeudController; view: FeudViewModel } => {
  const settings = resolveFeudSettings(props.settings, props.gameSettings);
  const [controller] = useState(
    () =>
      new FeudController({
        teams: props.teams,
        match: resolveMatch(props),
        usedContentIds: props.usedContentIds,
        onContentUsed: (ids) => {
          props.onContentUsed(ids);
        },
        onStateChange: (state) => {
          props.onStateChange(state);
        },
        onGameEnd: (report) => {
          props.onGameEnd(report);
        },
        audio: props.audio,
        phones: props.phones,
        host: props.host,
        initialState: props.initialState,
        inputLocked: props.inputLocked,
        ...(settings === undefined ? {} : { settings }),
        ...(props.runtime === undefined ? {} : { runtime: props.runtime }),
      }),
  );

  useEffect(() => {
    controller.start();
    return () => {
      controller.stop();
    };
  }, [controller]);

  // Newer callbacks, teams, used ids and settings reach the running controller; it never re-reads props itself.
  // This runs after every render: update() is cheap and only publishes when teams actually changed.
  useEffect(() => {
    controller.update({
      teams: props.teams,
      usedContentIds: props.usedContentIds,
      onContentUsed: (ids) => {
        props.onContentUsed(ids);
      },
      onStateChange: (state) => {
        props.onStateChange(state);
      },
      onGameEnd: (report) => {
        props.onGameEnd(report);
      },
      ...(settings === undefined ? {} : { settings }),
    });
  });
  const { inputLocked } = props;
  useEffect(() => {
    controller.setInputLocked(inputLocked);
  }, [controller, inputLocked]);

  const view = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  return { controller, view };
};
