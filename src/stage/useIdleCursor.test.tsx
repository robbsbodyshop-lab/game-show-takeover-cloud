import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIdleCursor } from './useIdleCursor';

describe('useIdleCursor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('hides the cursor after 3 s without movement and shows it again on movement', () => {
    const { result } = renderHook(() => useIdleCursor(true));
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(true);
    act(() => {
      fireEvent.pointerMove(window);
    });
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current).toBe(true);
  });

  it('never hides the cursor outside show mode', () => {
    const { result } = renderHook(() => useIdleCursor(false));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current).toBe(false);
  });

  it('shows the cursor again when show mode ends', () => {
    const { result, rerender } = renderHook(({ on }) => useIdleCursor(on), { initialProps: { on: true } });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current).toBe(true);
    rerender({ on: false });
    expect(result.current).toBe(false);
  });
});
