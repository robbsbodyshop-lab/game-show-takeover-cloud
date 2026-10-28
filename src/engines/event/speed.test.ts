import { describe, expect, it } from 'vitest';
import { eventReducer } from './eventReducer';
import {
  createSpeedState,
  pauseSpeed,
  resumeSpeed,
  speedRemainingMs,
  startSpeed,
  timeUpSpeed,
} from './speed';
import { hubSession, run, teamScore } from './testHelpers';

describe('speed clock', () => {
  it('starts at 60 s, runs, pauses with the remaining time and resumes', () => {
    const idle = createSpeedState();
    expect(idle).toEqual({ status: 'idle', durationMs: 60_000, endsAt: null, remainingMs: 60_000 });
    const running = startSpeed(idle, 1_000);
    expect(running).toMatchObject({ status: 'running', endsAt: 61_000 });
    expect(speedRemainingMs(running, 21_000)).toBe(40_000);
    const paused = pauseSpeed(running, 21_000);
    expect(paused).toMatchObject({ status: 'paused', endsAt: null, remainingMs: 40_000 });
    expect(speedRemainingMs(paused, 999_999)).toBe(40_000);
    const again = resumeSpeed(paused, 100_000);
    expect(again).toMatchObject({ status: 'running', endsAt: 140_000 });
  });

  it('TIME_UP only fires once the clock has reached zero', () => {
    const running = startSpeed(createSpeedState(), 0);
    expect(timeUpSpeed(running, 59_999)).toBe(running);
    const done = timeUpSpeed(running, 60_000);
    expect(done).toMatchObject({ status: 'timeUp', endsAt: null, remainingMs: 0 });
    expect(timeUpSpeed(done, 70_000)).toBe(done);
  });

  it('a pause after the deadline floors at zero', () => {
    const running = startSpeed(createSpeedState(), 0);
    expect(pauseSpeed(running, 90_000).remainingMs).toBe(0);
    expect(resumeSpeed(pauseSpeed(running, 90_000), 91_000)).toEqual(pauseSpeed(running, 90_000));
  });

  it('illegal transitions return the same object', () => {
    const idle = createSpeedState();
    expect(pauseSpeed(idle, 0)).toBe(idle);
    expect(resumeSpeed(idle, 0)).toBe(idle);
    expect(timeUpSpeed(idle, 0)).toBe(idle);
    expect(startSpeed(idle, Number.NaN)).toBe(idle);
    const running = startSpeed(idle, 0);
    expect(startSpeed(running, 5)).toBe(running);
    expect(resumeSpeed(running, 5)).toBe(running);
  });

  it('a reload mid-round keeps the right time because the state holds endsAt', () => {
    const running = startSpeed(createSpeedState(), 10_000);
    const restored = JSON.parse(JSON.stringify(running)) as typeof running;
    expect(speedRemainingMs(restored, 40_000)).toBe(30_000);
  });
});

describe('speed round through the reducer', () => {
  it('START_SPEED is hub-only and uses the settings duration', () => {
    const hub = hubSession(3);
    const s = eventReducer(hub, { type: 'START_SPEED' });
    expect(s.phase).toBe('speed');
    expect(s.speed?.remainingMs).toBe(60_000);
    expect(eventReducer(s, { type: 'START_SPEED' })).toBe(s);
    const custom = eventReducer(
      { ...hub, settings: { ...hub.settings, speedRoundMs: 45_000 } },
      { type: 'START_SPEED' },
    );
    expect(custom.speed?.durationMs).toBe(45_000);
  });

  it('clock actions drive the clock and are ignored outside the speed phase', () => {
    const hub = hubSession(3);
    expect(eventReducer(hub, { type: 'SPEED_START', now: 0 })).toBe(hub);
    let s = run(hub, { type: 'START_SPEED' }, { type: 'SPEED_START', now: 0 });
    expect(s.speed?.status).toBe('running');
    expect(eventReducer(s, { type: 'SPEED_TIME_UP', now: 10 })).toBe(s);
    s = run(s, { type: 'SPEED_PAUSE', now: 20_000 }, { type: 'SPEED_RESUME', now: 30_000 });
    expect(s.speed?.endsAt).toBe(70_000);
    s = eventReducer(s, { type: 'SPEED_TIME_UP', now: 70_000 });
    expect(s.speed?.status).toBe('timeUp');
  });

  it('SPEED_RESULT applies awards and returns to the hub', () => {
    let s = run(hubSession(3), { type: 'START_SPEED' });
    s = eventReducer(s, {
      type: 'SPEED_RESULT',
      awards: [
        { team: 1, points: 10 },
        { team: 3, points: 20 },
        { team: 3, points: 5 },
      ],
    });
    expect(s.phase).toBe('hub');
    expect(s.speed).toBeNull();
    expect([teamScore(s, 1), teamScore(s, 2), teamScore(s, 3)]).toEqual([10, 0, 25]);
  });

  it('SPEED_RESULT is illegal outside the speed phase or with bad awards', () => {
    const hub = hubSession(3);
    expect(eventReducer(hub, { type: 'SPEED_RESULT', awards: [{ team: 1, points: 10 }] })).toBe(hub);
    const s = run(hub, { type: 'START_SPEED' });
    expect(eventReducer(s, { type: 'SPEED_RESULT', awards: [{ team: 9, points: 10 }] })).toBe(s);
    expect(eventReducer(s, { type: 'SPEED_RESULT', awards: [{ team: 1, points: 1.5 }] })).toBe(s);
  });

  it('GO_HUB leaves the speed round without awards', () => {
    const s = run(hubSession(3), { type: 'START_SPEED' });
    const hub = eventReducer(s, { type: 'GO_HUB' });
    expect(hub.phase).toBe('hub');
    expect(hub.speed).toBeNull();
  });
});
