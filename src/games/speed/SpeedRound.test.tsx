import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventAction } from '@/engines/event';
import { EventHarness } from './EventHarness';
import { SpeedRound } from './SpeedRound';
import { spiedAudio, speedSession } from './testKit';

const T0 = 1_700_000_000_000;

function mount(opts: { locked?: boolean; showMode?: boolean } = {}) {
  const log: EventAction[] = [];
  const sessionRef = { current: speedSession(3) };
  const audio = spiedAudio();
  const Wrap = ({ locked, showMode }: { locked: boolean; showMode: boolean }) => (
    <EventHarness initial={speedSession(3)} log={log}>
      {(session, dispatch) => {
        sessionRef.current = session;
        return (
          <SpeedRound
            session={session}
            dispatch={dispatch}
            inputLocked={locked}
            showMode={showMode}
            audio={audio.audio}
            now={() => Date.now()}
          />
        );
      }}
    </EventHarness>
  );
  const view = render(<Wrap locked={opts.locked ?? false} showMode={opts.showMode ?? false} />);
  return {
    log,
    sessionRef,
    audio,
    lock: (locked: boolean) => {
      view.rerender(<Wrap locked={locked} showMode={opts.showMode ?? false} />);
    },
  };
}

const clock = () => screen.getByTestId('speed-clock').textContent;
const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};
const press = (name: string | RegExp) => {
  fireEvent.click(screen.getByRole('button', { name }));
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('SpeedRound', () => {
  it('shows the SPEED ROUND marquee and a full 60 second clock before the start', () => {
    mount();
    expect(screen.getByRole('heading', { level: 1, name: 'SPEED ROUND' })).toBeInTheDocument();
    expect(clock()).toBe('60');
  });

  it('starts from now, counts down in whole seconds and loops the countdown theme', () => {
    const { log, audio } = mount();
    press('Start');
    expect(log[0]).toEqual({ type: 'SPEED_START', now: T0 });
    expect(screen.getByTestId('speed-round')).toHaveAttribute('data-status', 'running');
    expect(audio.loop).toHaveBeenCalledWith('countdown_theme');

    advance(10_000);
    expect(clock()).toBe('50');
    advance(1_500);
    expect(clock()).toBe('49'); // 48.5 s left rounds up: tenths are hidden
  });

  it('keeps the remaining time while paused and resumes from it', () => {
    const { log, audio } = mount();
    press('Start');
    advance(20_000);
    press('Pause');
    expect(log.at(-1)).toEqual({ type: 'SPEED_PAUSE', now: T0 + 20_000 });
    expect(audio.pauseAll).toHaveBeenCalled();

    advance(30_000);
    expect(clock()).toBe('40');
    expect(screen.getByRole('status')).toHaveTextContent('Paused');

    press('Resume');
    expect(log.at(-1)).toEqual({ type: 'SPEED_RESUME', now: T0 + 50_000 });
    expect(audio.resumeAll).toHaveBeenCalled();
    advance(5_000);
    expect(clock()).toBe('35');
  });

  it('freezes with inputLocked and resumes only what the lock paused', () => {
    const { log, lock } = mount();
    press('Start');
    advance(10_000);
    lock(true);
    expect(log.at(-1)).toEqual({ type: 'SPEED_PAUSE', now: T0 + 10_000 });
    advance(20_000);
    expect(clock()).toBe('50');
    lock(false);
    expect(log.at(-1)).toEqual({ type: 'SPEED_RESUME', now: T0 + 30_000 });
    advance(5_000);
    expect(clock()).toBe('45');
  });

  it('does not resume a clock the host paused when a lock comes and goes', () => {
    const { log, lock } = mount();
    press('Start');
    advance(5_000);
    press('Pause');
    const before = log.length;
    lock(true);
    lock(false);
    expect(log).toHaveLength(before);
    expect(clock()).toBe('55');
  });

  it('sends TIME_UP at zero and sounds the alarm exactly once', () => {
    const { log, audio, sessionRef } = mount();
    press('Start');
    advance(59_900);
    expect(log.some((a) => a.type === 'SPEED_TIME_UP')).toBe(false);
    expect(audio.play).not.toHaveBeenCalled();

    advance(200);
    expect(sessionRef.current.speed?.status).toBe('timeUp');
    expect(clock()).toBe('00');
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.play).toHaveBeenCalledWith('alarm');
    expect(audio.stopLoop).toHaveBeenCalledWith('countdown_theme');

    advance(10_000);
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Time!');
  });

  it('does not sound the alarm for a clock that was already at time up when mounted', () => {
    const log: EventAction[] = [];
    const audio = spiedAudio();
    let s = speedSession(2);
    s = {
      ...s,
      speed: s.speed && { ...s.speed, status: 'timeUp', endsAt: null, remainingMs: 0 },
    };
    render(
      <EventHarness initial={s} log={log}>
        {(session, dispatch) => (
          <SpeedRound
            session={session}
            dispatch={dispatch}
            inputLocked={false}
            showMode={false}
            audio={audio.audio}
          />
        )}
      </EventHarness>,
    );
    expect(audio.play).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Award and return to hub' })).toBeInTheDocument();
  });

  it('shows the typed challenge large for the room', () => {
    mount();
    fireEvent.change(screen.getByLabelText('Challenge text'), { target: { value: 'Hop on one foot' } });
    expect(screen.getByTestId('speed-challenge')).toHaveTextContent('Hop on one foot');
  });

  it('awards points and chips and returns to the hub', () => {
    const { log, sessionRef } = mount();
    press('Start');
    advance(61_000);

    press('Team 1 plus 10 points');
    press('Team 1 plus 10 points');
    press('Team 2 plus 1 chip');
    press('Team 3 minus 10 points'); // clamped: Team 3 has no score to lose
    expect(screen.getByTestId('award-points-1')).toHaveTextContent('+20');
    expect(screen.getByTestId('award-points-3')).toHaveTextContent('0');
    expect(screen.getByTestId('award-chips-2')).toHaveTextContent('+1 chip');

    press('Award and return to hub');
    expect(log.slice(-2)).toEqual([
      { type: 'CHIP_CHANGE', team: 2, delta: 1 },
      { type: 'SPEED_RESULT', awards: [{ team: 1, points: 20 }] },
    ]);
    const s = sessionRef.current;
    expect(s.phase).toBe('hub');
    expect(s.teams.map((t) => [t.score, t.chips])).toEqual([
      [20, 0],
      [0, 1],
      [0, 0],
    ]);
  });

  it('resets to a fresh full clock through the hub round trip', () => {
    const { log, sessionRef } = mount();
    press('Start');
    advance(12_000);
    press('Reset');
    expect(log.slice(-2)).toEqual([{ type: 'GO_HUB' }, { type: 'START_SPEED' }]);
    expect(sessionRef.current.speed?.status).toBe('idle');
    expect(clock()).toBe('60');
  });

  it('offers no clock adjustment buttons (the engine has no such action)', () => {
    mount();
    expect(screen.queryByRole('button', { name: /5 ?s/i })).toBeNull();
  });

  it('disables host buttons while input is locked', () => {
    mount({ locked: true });
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  });

  it('hides host controls in show mode and brings them back on hover', () => {
    mount({ showMode: true });
    expect(screen.getByTestId('speed-clock')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    expect(screen.queryByLabelText('Challenge text')).toBeNull();

    fireEvent.mouseEnter(screen.getByTestId('host-zone'));
    const zone = screen.getByTestId('host-zone');
    expect(within(zone).getByRole('button', { name: 'Start' })).toBeInTheDocument();
    fireEvent.mouseLeave(zone);
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
  });
});
