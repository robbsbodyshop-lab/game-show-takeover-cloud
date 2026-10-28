import { useEffect, useRef, useState } from 'react';
import type { AudioPlayer } from '@/audio/player';
import {
  Badge,
  Button,
  Inset,
  Label,
  Marquee,
  NumberDisplay,
  Panel,
  Stripes,
  useReducedMotion,
} from '@/design';
import {
  PLINKO_ROWS,
  PLINKO_SLOT_COUNT,
  plinkoChipsRemaining,
  selectedColumn,
  slotValue,
  type EventAction,
  type EventSession,
  type PlinkoDrop,
} from '@/engines/event';
import { HostZone } from '../speed/HostZone';
import { useTwoTap } from '../speed/useTwoTap';
import { LANDED_STEP } from './geometry';
import { PlinkoBoard, type BoardChip } from './PlinkoBoard';
import styles from './PlinkoScreen.module.css';

/** One peg row per step; 9 steps from release to the slot. */
export const STEP_MS = 320;
/** Slots worth at least this much get the studio audience. */
export const APPLAUSE_MIN_POINTS = 500;

export interface PlinkoScreenProps {
  session: EventSession;
  dispatch: (action: EventAction) => void;
  inputLocked: boolean;
  showMode: boolean;
  audio: AudioPlayer;
  /** Accepted for a uniform stage wiring; Plinko has no clock. */
  now?: () => number;
  /** Source of the eight 50/50 bounces, each in [0, 1). Injected so tests and replays are exact. */
  draw?: () => number;
}

const defaultDraw = (): number => Math.random();

interface Flight extends PlinkoDrop {
  id: number;
  step: number;
}

const startFlight = (drop: PlinkoDrop, id: number, jump: boolean): Flight => ({
  ...drop,
  id,
  step: jump ? LANDED_STEP : 0,
});

/**
 * Plinko finale (FR-053, HOST_FEATURE_INVENTORY.md 1.6). The engine decides everything: the host picks a
 * team and column, `PLINKO_DROP` carries eight draws, and the reducer records the path and slot. This
 * screen replays that recorded path one peg row at a time and holds the team's new total back until the
 * chip lands. Reduced motion jumps straight to the slot.
 */
export const PlinkoScreen = ({
  session,
  dispatch,
  inputLocked,
  showMode,
  audio,
  draw = defaultDraw,
}: PlinkoScreenProps) => {
  const reduced = useReducedMotion();
  const plinko = session.plinko;
  const drops = plinko?.drops;
  const dropCount = drops?.length ?? 0;
  const slotValues = session.settings.plinkoSlotValues;

  const [chosenTeam, setChosenTeam] = useState<number | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [seen, setSeen] = useState(dropCount);

  // A new entry in the engine's drop log starts the replay (derived during render, not in an effect).
  // Drops that were already there on mount (a reload) are not replayed.
  if (dropCount !== seen) {
    setSeen(dropCount);
    const last = drops?.[dropCount - 1];
    if (dropCount > seen && last) setFlight(startFlight(last, dropCount, reduced));
  }

  const landed = flight !== null && flight.step >= LANDED_STEP;
  const flying = flight !== null && !landed && !inputLocked;
  const flightId = flight?.id;

  useEffect(() => {
    if (!flying) return;
    const id = setInterval(() => {
      setFlight((f) => (f && f.step < LANDED_STEP ? { ...f, step: f.step + 1 } : f));
    }, STEP_MS);
    return () => {
      clearInterval(id);
    };
  }, [flying, flightId]);

  // Studio audience for a big slot, once per landing.
  const landedId = landed ? flight.id : null;
  const landedPoints = landed ? flight.points : 0;
  const announced = useRef(0);
  useEffect(() => {
    if (landedId === null || announced.current === landedId) return;
    announced.current = landedId;
    if (landedPoints >= APPLAUSE_MIN_POINTS) audio.play('applause');
  }, [landedId, landedPoints, audio]);

  const chipsLeft = plinkoChipsRemaining(session);
  const active =
    session.teams.find((t) => t.id === chosenTeam && t.chips > 0) ?? session.teams.find((t) => t.chips > 0);
  const column = plinko && active ? selectedColumn(plinko, active.id) : null;
  const inFlight = flight !== null && !landed;
  const controlsOff = inputLocked || inFlight;
  const canDrop = active !== undefined && column !== null && !controlsOff;

  const flightTeam = flight ? session.teams.find((t) => t.id === flight.team) : undefined;
  const boardChip: BoardChip | null =
    flight && flightTeam
      ? {
          id: flight.id,
          color: flightTeam.color,
          column: flight.column,
          xs: flight.xs,
          slot: flight.slot,
          points: flight.points,
          step: flight.step,
        }
      : null;

  const drop = () => {
    if (!active || column === null) return;
    const draws = Array.from({ length: PLINKO_ROWS }, () => draw());
    dispatch({ type: 'PLINKO_DROP', team: active.id, draw: draws });
  };

  const end = useTwoTap(() => {
    dispatch({ type: 'END_PLINKO' });
  });
  const endNeedsConfirm = chipsLeft > 0;

  if (!plinko) {
    return (
      <section className={styles.screen} data-testid="plinko-screen">
        <Marquee as="h1">PLINKO</Marquee>
        <p className={styles.empty}>Plinko has not started.</p>
      </section>
    );
  }

  /** The score on screen: a team's new total waits until its chip lands. */
  const shownScore = (teamId: number, score: number): number =>
    flight && inFlight && flight.team === teamId ? score - flight.points : score;

  const settled = inFlight ? plinko.drops.slice(0, -1) : plinko.drops;
  const recent = settled.slice(-3).reverse();
  const maxColumn = Math.min(PLINKO_SLOT_COUNT, slotValues.length || PLINKO_SLOT_COUNT);

  return (
    <section className={styles.screen} data-testid="plinko-screen">
      <Marquee as="h1" className={styles.title}>
        PLINKO
      </Marquee>
      <Stripes />
      <div className={styles.main}>
        <Panel className={styles.boardPanel}>
          <PlinkoBoard
            slotValues={slotValues}
            marker={active && column !== null ? { column, color: active.color } : null}
            chip={boardChip}
          />
        </Panel>
        <Panel className={styles.sidePanel}>
          <Label>Teams</Label>
          <ul className={styles.teams}>
            {session.teams.map((team) => {
              const col = selectedColumn(plinko, team.id);
              return (
                <li
                  key={team.id}
                  className={styles.team}
                  data-active={team.id === active?.id}
                  data-testid={`team-row-${team.id.toString()}`}
                  style={{ borderLeftColor: team.color }}
                >
                  <span className={styles.teamName}>{team.name}</span>
                  <Badge tone={team.chips > 0 ? 'gold' : 'cream'} data-testid={`chips-${team.id.toString()}`}>
                    {team.chips} chip{team.chips === 1 ? '' : 's'}
                  </Badge>
                  {col !== null && <Badge tone="info">col {col + 1}</Badge>}
                  <NumberDisplay
                    size="md"
                    value={shownScore(team.id, team.score)}
                    data-testid={`score-${team.id.toString()}`}
                  />
                </li>
              );
            })}
          </ul>
          <div aria-live="polite" className={styles.recent} data-testid="plinko-log">
            {recent.map((d, i) => (
              <p key={settled.length - i} className={styles.logLine}>
                {session.teams.find((t) => t.id === d.team)?.name ?? `Team ${d.team.toString()}`}: slot{' '}
                {d.slot + 1}, +{d.points}
              </p>
            ))}
          </div>
          <p className={styles.remaining}>
            {chipsLeft} chip{chipsLeft === 1 ? '' : 's'} left
          </p>
        </Panel>
      </div>

      <HostZone showMode={showMode} className={styles.host}>
        <Inset className={styles.controls}>
          <div className={styles.row}>
            <Label>Team</Label>
            <div className={styles.group} role="group" aria-label="Team">
              {session.teams.map((team) => (
                <Button
                  key={team.id}
                  size="sm"
                  variant={team.id === active?.id ? 'secondary' : 'quiet'}
                  aria-pressed={team.id === active?.id}
                  disabled={team.chips < 1 || controlsOff}
                  style={{ borderBottomColor: team.color }}
                  onClick={() => {
                    setChosenTeam(team.id);
                  }}
                >
                  {team.name} ({team.chips})
                </Button>
              ))}
            </div>
          </div>
          <div className={styles.row}>
            <Label>Column</Label>
            <div className={styles.group} role="group" aria-label="Column">
              {Array.from({ length: maxColumn }, (_, i) => (
                <Button
                  key={i}
                  size="sm"
                  variant={column === i ? 'secondary' : 'quiet'}
                  aria-pressed={column === i}
                  aria-label={`Column ${(i + 1).toString()}, worth ${slotValue(slotValues, i).toString()}`}
                  disabled={!active || controlsOff}
                  onClick={() => {
                    if (active) dispatch({ type: 'PLINKO_SELECT_COLUMN', team: active.id, column: i });
                  }}
                >
                  {i + 1}
                </Button>
              ))}
              <Button variant="confirm" disabled={!canDrop} onClick={drop}>
                Drop
              </Button>
              <Button
                variant={end.armed ? 'danger' : 'host'}
                disabled={inputLocked}
                onClick={
                  endNeedsConfirm
                    ? end.press
                    : () => {
                        dispatch({ type: 'END_PLINKO' });
                      }
                }
              >
                {end.armed ? 'Tap again: end Plinko, chips unused' : 'End Plinko'}
              </Button>
            </div>
          </div>
        </Inset>
      </HostZone>
    </section>
  );
};
