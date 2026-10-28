import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryCardMenu, type MemoryCardItem } from './MemoryCardMenu';
import { nextIndex } from './memoryCardNav';

afterEach(cleanup);

const ITEMS: MemoryCardItem[] = [
  { id: 'a', title: 'Alpha', subtitle: 'one' },
  { id: 'b', title: 'Bravo' },
  { id: 'c', title: 'Charlie', disabled: true },
  { id: 'd', title: 'Delta' },
  { id: 'e', title: 'Echo' },
  { id: 'f', title: 'Foxtrot' },
];

describe('nextIndex', () => {
  it('moves within a row without wrapping', () => {
    expect(nextIndex(0, 'ArrowRight', 6, 3)).toBe(1);
    expect(nextIndex(2, 'ArrowRight', 6, 3)).toBe(2);
    expect(nextIndex(3, 'ArrowLeft', 6, 3)).toBe(3);
  });

  it('moves between rows and clamps at the edges', () => {
    expect(nextIndex(1, 'ArrowDown', 6, 3)).toBe(4);
    expect(nextIndex(4, 'ArrowUp', 6, 3)).toBe(1);
    expect(nextIndex(1, 'ArrowUp', 6, 3)).toBe(1);
    expect(nextIndex(4, 'ArrowDown', 6, 3)).toBe(4);
  });

  it('skips disabled tiles in the direction of travel and stays put when blocked', () => {
    const disabled = (i: number) => i === 1 || i === 2;
    expect(nextIndex(0, 'ArrowRight', 6, 3, disabled)).toBe(0);
    expect(nextIndex(0, 'End', 6, 3, disabled)).toBe(5);
    expect(nextIndex(5, 'Home', 6, 3, disabled)).toBe(0);
  });
});

describe('MemoryCardMenu', () => {
  it('renders titles, subtitles and the selected state', () => {
    render(<MemoryCardMenu label="Menu" items={ITEMS} value="b" onSelect={() => undefined} />);
    expect(screen.getByRole('listbox', { name: 'Menu' })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(6);
    expect(screen.getByText('one')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Bravo/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: /Alpha/ })).toHaveAttribute('aria-selected', 'false');
  });

  it('has a single tab stop that starts on the selected tile', async () => {
    const user = userEvent.setup();
    render(<MemoryCardMenu label="Menu" items={ITEMS} value="b" onSelect={() => undefined} />);
    const stops = screen.getAllByRole('option').filter((o) => o.getAttribute('tabindex') === '0');
    expect(stops).toHaveLength(1);
    await user.tab();
    expect(screen.getByRole('option', { name: /Bravo/ })).toHaveFocus();
  });

  it('moves the cursor with arrows, skipping disabled tiles, and selects with Enter', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<MemoryCardMenu label="Menu" items={ITEMS} columns={3} onSelect={onSelect} />);
    await user.tab();
    expect(screen.getByRole('option', { name: /Alpha/ })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('option', { name: /Bravo/ })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('option', { name: /Bravo/ })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('option', { name: /Echo/ })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('option', { name: /Delta/ })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('d');
    await user.keyboard('{End}');
    expect(screen.getByRole('option', { name: /Foxtrot/ })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('option', { name: /Alpha/ })).toHaveFocus();
  });

  it('selects on click and ignores disabled tiles', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<MemoryCardMenu label="Menu" items={ITEMS} onSelect={onSelect} />);
    await user.click(screen.getByRole('option', { name: /Charlie/ }));
    expect(onSelect).not.toHaveBeenCalled();
    await user.click(screen.getByRole('option', { name: /Echo/ }));
    expect(onSelect).toHaveBeenCalledWith('e');
  });
});
