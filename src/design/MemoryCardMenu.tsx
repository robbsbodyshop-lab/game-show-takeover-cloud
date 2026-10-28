import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from './cx';
import { nextIndex, type NavKey } from './memoryCardNav';
import styles from './MemoryCardMenu.module.css';

export interface MemoryCardItem {
  id: string;
  title: string;
  subtitle?: string;
  /** Icon slot: a small pixel image or glyph, drawn above the title. */
  icon?: ReactNode;
  disabled?: boolean;
}

export interface MemoryCardMenuProps {
  items: readonly MemoryCardItem[];
  /** Accessible name for the menu. */
  label: string;
  /** The committed choice, if any; drawn with the selected state. */
  value?: string;
  columns?: number;
  onSelect: (id: string) => void;
  className?: string;
}

const NAV_KEYS = new Set<string>(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);
const isNavKey = (key: string): key is NavKey => NAV_KEYS.has(key);

/**
 * PS1 memory-card menu: a grid of chunky tiles with a single cursor (roving tab stop).
 * Arrows/Home/End move the cursor, Enter or Space (or a click) selects.
 */
export const MemoryCardMenu = ({
  items,
  label,
  value,
  columns = 3,
  onSelect,
  className,
}: MemoryCardMenuProps) => {
  const firstEnabled = Math.max(
    0,
    items.findIndex((item) => !item.disabled),
  );
  const valueIndex = items.findIndex((item) => item.id === value);
  const [cursor, setCursor] = useState(valueIndex >= 0 ? valueIndex : firstEnabled);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const active = Math.min(cursor, Math.max(0, items.length - 1));

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isNavKey(event.key)) return;
    event.preventDefault();
    const next = nextIndex(active, event.key, items.length, columns, (i) => items[i]?.disabled === true);
    setCursor(next);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="listbox"
      aria-label={label}
      className={cx(styles.menu, className)}
      style={{ gridTemplateColumns: `repeat(${columns.toString()}, minmax(0, 1fr))` }}
      onKeyDown={onKeyDown}
    >
      {items.map((item, index) => (
        <button
          key={item.id}
          ref={(node) => {
            refs.current[index] = node;
          }}
          type="button"
          role="option"
          aria-selected={item.id === value}
          disabled={item.disabled}
          tabIndex={index === active ? 0 : -1}
          data-cursor={index === active}
          className={styles.tile}
          onFocus={() => {
            setCursor(index);
          }}
          onClick={() => {
            onSelect(item.id);
          }}
        >
          {item.icon ? <span className={styles.icon}>{item.icon}</span> : null}
          <span className={styles.title}>{item.title}</span>
          {item.subtitle ? <span className={styles.subtitle}>{item.subtitle}</span> : null}
        </button>
      ))}
    </div>
  );
};
