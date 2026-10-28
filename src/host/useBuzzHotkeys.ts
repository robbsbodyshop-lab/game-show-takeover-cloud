import { useEffect } from 'react';

const isTextTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
};

/** Keys 1-8 buzz for that team (HOST_FEATURE_INVENTORY §2.1): ignored in text fields and while held. */
export function useBuzzHotkeys(enabled: boolean, onBuzz: (team: number) => void): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      if (isTextTarget(event.target)) return;
      if (!/^[1-8]$/.test(event.key)) return;
      event.preventDefault();
      onBuzz(Number(event.key));
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [enabled, onBuzz]);
}
