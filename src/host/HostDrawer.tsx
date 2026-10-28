import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from '@/design';
import { HostConsoleFor } from './HostConsoleFor';
import type { HostSend, HostSnapshot } from './hostProtocol';
import styles from './HostDrawer.module.css';

type DrawerTab = 'console' | 'settings';

export interface HostDrawerProps {
  open: boolean;
  onClose: () => void;
  /** The stage's own snapshot for what is on screen (a game, or the hub); null before the first one. */
  snapshot: HostSnapshot | null;
  /** Dispatches straight into the stage: no network, no `result` round trip. */
  send: HostSend;
  /** Content of the Settings tab (the stage's settings form and game options). */
  settings?: ReactNode;
}

/** F2 drawer on the stage window (FR-012): the current game's console and the settings, in a side panel. */
export const HostDrawer = ({ open, onClose, snapshot, send, settings }: HostDrawerProps) => {
  const [tab, setTab] = useState<DrawerTab>('console');
  const baseId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const onTabKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      setTab((current) => (current === 'console' ? 'settings' : 'console'));
    }
  };

  const tabId = (t: DrawerTab) => `${baseId}-tab-${t}`;
  const panelId = (t: DrawerTab) => `${baseId}-panel-${t}`;

  return (
    <aside className={styles.drawer} aria-label="Host tools">
      <div className={styles.header}>
        <h2 className={styles.title}>Host tools</h2>
        <Button size="sm" variant="quiet" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className={styles.tabs} role="tablist" aria-label="Host tools sections" onKeyDown={onTabKeys}>
        {(['console', 'settings'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            id={tabId(t)}
            className={styles.tab}
            aria-selected={tab === t}
            aria-controls={panelId(t)}
            tabIndex={tab === t ? 0 : -1}
            onClick={() => {
              setTab(t);
            }}
          >
            {t === 'console' ? 'Console' : 'Settings'}
          </button>
        ))}
      </div>
      <div className={styles.body} role="tabpanel" id={panelId(tab)} aria-labelledby={tabId(tab)}>
        {tab === 'console' ? (
          <HostConsoleFor kind={snapshot?.kind ?? 'hub'} snapshot={snapshot} send={send} />
        ) : (
          (settings ?? <p>No settings here yet.</p>)
        )}
      </div>
    </aside>
  );
};
