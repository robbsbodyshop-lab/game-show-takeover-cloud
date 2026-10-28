import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createEventSession, eventReducer, type EventAction, type EventSession } from '@/engines/event';
import { useSpeedClockLock } from './useSpeedClockLock';

const speedSession = (status: 'running' | 'paused' | 'idle'): EventSession => {
  let s = createEventSession();
  s = eventReducer(s, { type: 'GO_HUB' });
  s = eventReducer(s, { type: 'START_SPEED' });
  if (status !== 'idle') s = eventReducer(s, { type: 'SPEED_START', now: 0 });
  if (status === 'paused') s = eventReducer(s, { type: 'SPEED_PAUSE', now: 1000 });
  return s;
};

describe('useSpeedClockLock', () => {
  const now = () => 5000;

  it('pauses a running Speed Round clock while locked and resumes it afterwards', () => {
    const dispatch = vi.fn<(a: EventAction) => void>();
    const { rerender } = renderHook(
      ({ locked, session }) => {
        useSpeedClockLock(session, locked, dispatch, now);
      },
      { initialProps: { locked: false, session: speedSession('running') } },
    );
    expect(dispatch).not.toHaveBeenCalled();
    rerender({ locked: true, session: speedSession('running') });
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'SPEED_PAUSE', now: 5000 });
    rerender({ locked: true, session: speedSession('paused') });
    expect(dispatch).toHaveBeenCalledTimes(1);
    rerender({ locked: false, session: speedSession('paused') });
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'SPEED_RESUME', now: 5000 });
  });

  it('leaves a clock the host paused by hand alone', () => {
    const dispatch = vi.fn<(a: EventAction) => void>();
    const { rerender } = renderHook(
      ({ locked }) => {
        useSpeedClockLock(speedSession('paused'), locked, dispatch, now);
      },
      { initialProps: { locked: true } },
    );
    rerender({ locked: false });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does nothing when no Speed Round is on screen', () => {
    const dispatch = vi.fn<(a: EventAction) => void>();
    renderHook(() => {
      useSpeedClockLock(createEventSession(), true, dispatch, now);
    });
    expect(dispatch).not.toHaveBeenCalled();
  });
});
