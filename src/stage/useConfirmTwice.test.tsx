import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfirmTwice } from './useConfirmTwice';

describe('useConfirmTwice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('confirms only on the second tap inside the window', () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useConfirmTwice(onConfirm));
    act(() => {
      result.current.trigger();
    });
    expect(result.current.armed).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(3999);
      result.current.trigger();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(result.current.armed).toBe(false);
  });

  it('disarms after 4 seconds, so the next tap only arms again', () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useConfirmTwice(onConfirm));
    act(() => {
      result.current.trigger();
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.armed).toBe(false);
    act(() => {
      result.current.trigger();
    });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(result.current.armed).toBe(true);
  });
});
