/**
 * Global stage hotkeys (HOST_FEATURE_INVENTORY.md 2.1):
 *  F2 host drawer, F8 pause/resume, F9 show mode, Escape resumes, 1-8 buzz for that team.
 * All of them ignore text fields and held keys. While paused (and no dialog open) Enter and Space are
 * swallowed before any game sees them, so a presenter clicker cannot resume or advance play.
 * The listener is on `window` in the capture phase for exactly that reason.
 */
import { useEffect, useRef } from 'react';

export interface HotkeyState {
  paused: boolean;
  dialogOpen: boolean;
}

export interface HotkeyActions {
  toggleHostDrawer: () => void;
  togglePause: () => void;
  resume: () => void;
  toggleShowMode: () => void;
  /** Keyboard buzz for a team id 1..8. */
  buzz: (team: number) => void;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

const isConfirmKey = (key: string): boolean => key === 'Enter' || key === ' ';

/** Pure key routing, exported for tests. Returns true when the event was consumed. */
export function routeStageKey(event: KeyboardEvent, state: HotkeyState, actions: HotkeyActions): boolean {
  if (isEditableTarget(event.target)) return false;

  if (state.paused && !state.dialogOpen && isConfirmKey(event.key)) {
    event.preventDefault();
    event.stopPropagation();
    return true;
  }
  if (event.repeat) return false;

  const plain = !event.ctrlKey && !event.altKey && !event.metaKey;
  const consume = (action: () => void): true => {
    event.preventDefault();
    action();
    return true;
  };

  switch (event.key) {
    case 'F2':
      return state.paused || state.dialogOpen ? false : consume(actions.toggleHostDrawer);
    case 'F8':
      return consume(actions.togglePause);
    case 'F9':
      return consume(actions.toggleShowMode);
    case 'Escape':
      return state.paused && !state.dialogOpen ? consume(actions.resume) : false;
    default:
  }

  if (plain && /^[1-8]$/.test(event.key) && !state.paused && !state.dialogOpen) {
    const team = Number(event.key);
    return consume(() => {
      actions.buzz(team);
    });
  }
  return false;
}

export function useHotkeys(state: HotkeyState, actions: HotkeyActions): void {
  const latest = useRef({ state, actions });

  useEffect(() => {
    latest.current = { state, actions };
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      routeStageKey(event, latest.current.state, latest.current.actions);
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      const { paused, dialogOpen } = latest.current.state;
      if (paused && !dialogOpen && isConfirmKey(event.key) && !isEditableTarget(event.target)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, []);
}
