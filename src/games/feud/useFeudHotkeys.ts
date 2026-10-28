import { useEffect } from 'react';
import type { FeudController } from './FeudController';

const TEXT_TARGETS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Stage hotkeys (HOST_FEATURE_INVENTORY.md 2.1 and 2.7): Enter advances, Space opens the buzzers,
 * X strike, P pass, Y play, R reveal next, U undo. Keys do nothing in text boxes, a held key does not
 * repeat, and Ctrl/Alt/Cmd combinations are ignored. 1-8 and F2 belong to the stage.
 */
export const useFeudHotkeys = (controller: FeudController, enabled: boolean): void => {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.isContentEditable || TEXT_TARGETS.has(target.tagName)) return;
        // A focused button handles Enter and Space itself.
        if ((event.key === 'Enter' || event.key === ' ') && target.tagName === 'BUTTON') return;
      }
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const commands: Record<string, string> = {
        Enter: 'advance',
        ' ': 'open-buzzers',
        x: 'strike',
        p: 'pass',
        y: 'play',
        r: 'reveal-next',
        u: 'undo',
      };
      const command = commands[key];
      if (command === undefined) return;
      const outcome = controller.run(command);
      if (outcome.applied) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [controller, enabled]);
};
