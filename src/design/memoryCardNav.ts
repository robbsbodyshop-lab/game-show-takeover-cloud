export type NavKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End';

/**
 * Cursor movement on a grid of tiles laid out row by row. Disabled tiles are skipped in the
 * direction of travel; the cursor stays put when nothing enabled lies that way. No wrapping,
 * like the PS1 memory card screen.
 */
export const nextIndex = (
  current: number,
  key: NavKey,
  count: number,
  columns: number,
  isDisabled: (index: number) => boolean = () => false,
): number => {
  if (count <= 0) return current;
  const cols = Math.max(1, columns);
  const scan = (from: number, step: number, inRange: (i: number) => boolean): number => {
    for (let i = from; inRange(i); i += step) {
      if (!isDisabled(i)) return i;
    }
    return current;
  };
  switch (key) {
    case 'ArrowLeft':
      return scan(current - 1, -1, (i) => i >= 0 && Math.floor(i / cols) === Math.floor(current / cols));
    case 'ArrowRight':
      return scan(current + 1, 1, (i) => i < count && Math.floor(i / cols) === Math.floor(current / cols));
    case 'ArrowUp':
      return scan(current - cols, -cols, (i) => i >= 0);
    case 'ArrowDown':
      return scan(current + cols, cols, (i) => i < count);
    case 'Home':
      return scan(0, 1, (i) => i < count);
    case 'End':
      return scan(count - 1, -1, (i) => i >= 0);
  }
};
