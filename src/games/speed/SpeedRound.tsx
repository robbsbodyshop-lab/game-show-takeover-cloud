import { useEffect, useId, useRef, useState } from 'react';
import type { AudioPlayer } from '@/audio/player';
import { Badge, Button, Inset, Label, Marquee, NumberDisplay, Panel, Stripes } from '@/design';
import { speedRemainingMs, type EventAction, type EventSession } from '@/engines/event';
import { HostZone } from './HostZone';
import { SpeedAwards, type TeamAward } from './SpeedAwards';
import styles from './SpeedRound.module.css';

export const CHALLENGE_MAX_LENGTH = 200;
const TICK_MS = 100;

export interface SpeedRoundProps {
  session: EventSession;
  dispatch: (action: EventAction) => void;
  /** True while paused (F8) or a dialog is open: the clock and its music freeze. */
  inputLocked: boolean;
  showMode: boolean;
  audio: AudioPlayer;
  /** Epoch ms; injected so tests and reloads control the clock. */
  now?: () => number;
  /** Accepted for a uniform stage wiring; the Speed Round has no randomness. */
  draw?: () => number;
}

const defaultNow = (): number => Date.now();

/**
 * Speed Round stage screen (FR-052, HOST_FEATURE_INVENTORY.md 1.6 and 2.11). The engine owns the clock as
 * { endsAt, remainingMs }; this screen only paints it, dispatches TIME_UP when it reaches zero, and keeps
 * the `countdown_theme` bed in step with it.
 */
export const SpeedRound = ({
  session,
  dispatch,
  inputLocked,
  showMode,
  audio,
  now = defaultNow,
}: SpeedRoundProps) => {
  const challengeId = useId();
  const speed = session.speed;
  const status = speed?.status ?? 'idle';
  const endsAt = speed?.endsAt ?? null;

  const [, setTick] = useState(0);
  const [challenge, setChallenge] = useState('');
  const [awardsOpen, setAwardsOpen] = useState(false);

  // Latest callbacks for timers, so a parent that rebuilds them every render does not restart the interval.
  const latest = useRef({ dispatch, now });
  useEffect(() => {
    latest.current = { dispatch, now };
  });

  // Repaint ten times a second while running and send TIME_UP exactly when the clock reaches zero.
  useEffect(() => {
    if (status !== 'running' || inputLocked || endsAt === null) return;
    const id = setInterval(() => {
      const t = latest.current.now();
      setTick((n) => n + 1);
      if (t >= endsAt) latest.current.dispatch({ type: 'SPEED_TIME_UP', now: t });
    }, TICK_MS);
    return () => {
      clearInterval(id);
    };
  }, [status, inputLocked, endsAt]);

  // Pause (F8, a dialog) freezes the clock; the same unlock resumes only what the lock paused.
  const lockPaused = useRef(false);
  useEffect(() => {
    if (inputLocked && status === 'running') {
      lockPaused.current = true;
      latest.current.dispatch({ type: 'SPEED_PAUSE', now: latest.current.now() });
    } else if (!inputLocked && lockPaused.current) {
      lockPaused.current = false;
      if (status === 'paused') latest.current.dispatch({ type: 'SPEED_RESUME', now: latest.current.now() });
    }
  }, [inputLocked, status]);

  // Music: loops while the clock runs, freezes with it (position kept), stops at idle and time up.
  const playing = status === 'running' && !inputLocked;
  const frozen = status === 'paused' || (status === 'running' && inputLocked);
  const weFroze = useRef(false);
  useEffect(() => {
    if (playing) {
      if (weFroze.current) audio.resumeAll();
      weFroze.current = false;
      audio.loop('countdown_theme');
    } else if (frozen) {
      audio.pauseAll();
      weFroze.current = true;
    } else {
      audio.stopLoop('countdown_theme');
      if (weFroze.current) audio.resumeAll();
      weFroze.current = false;
    }
  }, [playing, frozen, audio]);
  useEffect(() => {
    const froze = weFroze;
    return () => {
      audio.stopLoop('countdown_theme');
      if (froze.current) audio.resumeAll();
      froze.current = false;
    };
  }, [audio]);

  // The alarm sounds on the running -> time up transition only, never for a clock that was already done.
  const previous = useRef(status);
  useEffect(() => {
    if (status === 'timeUp' && previous.current === 'running') audio.play('alarm');
    previous.current = status;
  }, [status, audio]);

  if (!speed) {
    return (
      <section className={styles.screen} data-testid="speed-round" data-status="none">
        <Marquee as="h1">SPEED ROUND</Marquee>
        <Panel className={styles.challengePanel}>
          <p className={styles.challengeText}>No Speed Round is running.</p>
        </Panel>
      </section>
    );
  }

  const remaining = speedRemainingMs(speed, now());
  const seconds = Math.ceil(remaining / 1000);
  const idle = status === 'idle';
  const showAwards = awardsOpen || status === 'timeUp';

  const onAward = (awards: TeamAward[]) => {
    for (const a of awards) {
      if (a.chips > 0) dispatch({ type: 'CHIP_CHANGE', team: a.team, delta: a.chips });
    }
    dispatch({
      type: 'SPEED_RESULT',
      awards: awards.filter((a) => a.points !== 0).map((a) => ({ team: a.team, points: a.points })),
    });
  };

  // The engine has no reset action: leaving and re-entering the round gives a fresh full clock.
  const onReset = () => {
    audio.stopLoop('countdown_theme');
    setAwardsOpen(false);
    dispatch({ type: 'GO_HUB' });
    dispatch({ type: 'START_SPEED' });
  };

  return (
    <section
      className={styles.screen}
      data-testid="speed-round"
      data-status={status}
      data-awards={showAwards}
    >
      <Marquee as="h1" className={styles.title}>
        SPEED ROUND
      </Marquee>
      <Stripes />
      <div className={styles.main}>
        <Panel className={styles.clockPanel}>
          <Label>Time left</Label>
          <NumberDisplay
            size="xl"
            value={seconds}
            padTo={2}
            role="timer"
            aria-label="Seconds left"
            className={styles.clock}
            data-testid="speed-clock"
            data-low={status === 'running' && seconds <= 10}
          />
          {status === 'timeUp' && (
            <Badge tone="orange" role="status" className={styles.flag}>
              Time!
            </Badge>
          )}
          {status === 'paused' && (
            <Badge tone="gold" role="status" className={styles.flag}>
              Paused
            </Badge>
          )}
        </Panel>
        <Panel className={styles.challengePanel}>
          <Label>Challenge</Label>
          <p className={styles.challengeText} data-testid="speed-challenge">
            {challenge.trim() === '' ? 'Get ready' : challenge}
          </p>
        </Panel>
      </div>

      <HostZone showMode={showMode} className={styles.host}>
        <Inset className={styles.controls}>
          <Label htmlFor={challengeId}>Challenge text</Label>
          <textarea
            id={challengeId}
            className={styles.input}
            value={challenge}
            maxLength={CHALLENGE_MAX_LENGTH}
            rows={2}
            placeholder="Type the physical challenge"
            onChange={(event) => {
              setChallenge(event.target.value);
            }}
          />
          <div className={styles.buttons}>
            <Button
              variant="confirm"
              disabled={!idle || inputLocked}
              onClick={() => {
                dispatch({ type: 'SPEED_START', now: now() });
              }}
            >
              Start
            </Button>
            {status === 'paused' ? (
              <Button
                variant="secondary"
                disabled={inputLocked}
                onClick={() => {
                  dispatch({ type: 'SPEED_RESUME', now: now() });
                }}
              >
                Resume
              </Button>
            ) : (
              <Button
                variant="secondary"
                disabled={status !== 'running' || inputLocked}
                onClick={() => {
                  dispatch({ type: 'SPEED_PAUSE', now: now() });
                }}
              >
                Pause
              </Button>
            )}
            <Button variant="danger" disabled={idle || inputLocked} onClick={onReset}>
              Reset
            </Button>
            {status !== 'timeUp' && (
              <Button
                variant="host"
                disabled={inputLocked}
                aria-pressed={awardsOpen}
                onClick={() => {
                  setAwardsOpen((open) => !open);
                }}
              >
                Awards
              </Button>
            )}
          </div>
        </Inset>
        {showAwards && <SpeedAwards teams={session.teams} disabled={inputLocked} onAward={onAward} />}
      </HostZone>
    </section>
  );
};
