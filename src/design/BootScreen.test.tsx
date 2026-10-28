import { cleanup, act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BootScreen } from './BootScreen';

afterEach(cleanup);

const mockReducedMotion = (reduce: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
};

describe('BootScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // @ts-expect-error jsdom does not define matchMedia; restore that
    delete window.matchMedia;
  });

  it('calls onDone after two seconds', () => {
    mockReducedMotion(false);
    const onDone = vi.fn();
    render(<BootScreen onDone={onDone} />);
    expect(screen.getByRole('status', { name: 'Starting' })).toBeInTheDocument();
    expect(screen.getByText('Game Show Takeover')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('can be skipped with a key press and still fires once', () => {
    mockReducedMotion(false);
    const onDone = vi.fn();
    render(<BootScreen onDone={onDone} />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      vi.advanceTimersByTime(5000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('skips instantly and renders nothing under reduced motion', () => {
    mockReducedMotion(true);
    const onDone = vi.fn();
    render(<BootScreen onDone={onDone} />);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
