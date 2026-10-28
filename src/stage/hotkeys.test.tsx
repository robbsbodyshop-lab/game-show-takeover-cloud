import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useHotkeys, type HotkeyActions, type HotkeyState } from './hotkeys';

const actions = (): HotkeyActions => ({
  toggleHostDrawer: vi.fn(),
  togglePause: vi.fn(),
  resume: vi.fn(),
  toggleShowMode: vi.fn(),
  buzz: vi.fn(),
});

const Harness = ({ state, acts }: { state: HotkeyState; acts: HotkeyActions }) => {
  useHotkeys(state, acts);
  return <input aria-label="text" />;
};

const open: HotkeyState = { paused: false, dialogOpen: false };

describe('hotkeys', () => {
  it('maps F2, F8, F9 and the digits 1 to 8', () => {
    const acts = actions();
    render(<Harness state={open} acts={acts} />);
    fireEvent.keyDown(window, { key: 'F2' });
    fireEvent.keyDown(window, { key: 'F8' });
    fireEvent.keyDown(window, { key: 'F9' });
    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: '8' });
    fireEvent.keyDown(window, { key: '9' });
    fireEvent.keyDown(window, { key: '0' });
    expect(acts.toggleHostDrawer).toHaveBeenCalledTimes(1);
    expect(acts.togglePause).toHaveBeenCalledTimes(1);
    expect(acts.toggleShowMode).toHaveBeenCalledTimes(1);
    expect(acts.buzz).toHaveBeenCalledTimes(2);
    expect(acts.buzz).toHaveBeenNthCalledWith(1, 1);
    expect(acts.buzz).toHaveBeenNthCalledWith(2, 8);
  });

  it('ignores held keys and modified digits', () => {
    const acts = actions();
    render(<Harness state={open} acts={acts} />);
    fireEvent.keyDown(window, { key: 'F8', repeat: true });
    fireEvent.keyDown(window, { key: '2', repeat: true });
    fireEvent.keyDown(window, { key: '2', ctrlKey: true });
    expect(acts.togglePause).not.toHaveBeenCalled();
    expect(acts.buzz).not.toHaveBeenCalled();
  });

  it('ignores every key typed into a text field', () => {
    const acts = actions();
    const { getByLabelText } = render(<Harness state={open} acts={acts} />);
    const input = getByLabelText('text');
    fireEvent.keyDown(input, { key: '3' });
    fireEvent.keyDown(input, { key: 'F8' });
    expect(acts.buzz).not.toHaveBeenCalled();
    expect(acts.togglePause).not.toHaveBeenCalled();
  });

  it('while paused: swallows Enter and Space, blocks buzzes, F2 and lets F8 and Escape resume', () => {
    const acts = actions();
    const later = vi.fn();
    window.addEventListener('keydown', later);
    render(<Harness state={{ paused: true, dialogOpen: false }} acts={acts} />);
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    window.dispatchEvent(enter);
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    window.dispatchEvent(space);
    expect(enter.defaultPrevented).toBe(true);
    expect(space.defaultPrevented).toBe(true);
    expect(later).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: 'F2' });
    expect(acts.buzz).not.toHaveBeenCalled();
    expect(acts.toggleHostDrawer).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'F8' });
    expect(acts.resume).toHaveBeenCalledTimes(1);
    expect(acts.togglePause).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', later);
  });

  it('with a dialog open: no buzzes or F2, Enter passes through, Escape is left to the dialog', () => {
    const acts = actions();
    render(<Harness state={{ paused: false, dialogOpen: true }} acts={acts} />);
    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: 'F2' });
    fireEvent.keyDown(window, { key: 'Escape' });
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    window.dispatchEvent(enter);
    expect(acts.buzz).not.toHaveBeenCalled();
    expect(acts.toggleHostDrawer).not.toHaveBeenCalled();
    expect(acts.resume).not.toHaveBeenCalled();
    expect(enter.defaultPrevented).toBe(false);
  });
});
