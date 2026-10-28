/**
 * The spin animation as data (FR-042). The engine decides the wedge from the injected draw; this
 * module turns the same draw into 3-5 full turns plus the landing angle, with stepped easing, so a
 * given draw always animates the same way and always lands the pointer inside the wedge the engine
 * picked. Angles are degrees of clockwise rotation of the wheel; the pointer is fixed at the top.
 */

export type SpinKind = 'wheel' | 'bonus';

export const SPIN_FRAME_MS = 50;
const WHEEL_BASE_MS = 5200;
const WHEEL_PER_TURN_MS = 500;
export const BONUS_SPIN_MS = 5000;
export const REDUCED_SPIN_MS = 1200;

export interface SpinPlan {
  kind: SpinKind;
  draw: number;
  wedgeCount: number;
  /** Where the wheel rested before the spin (0 <= startDeg < 360). */
  startDeg: number;
  /** Final rotation, startDeg + whole turns + the landing offset. */
  endDeg: number;
  fullTurns: number;
  durationMs: number;
  frameMs: number;
  frames: number;
  /** Frame numbers at which the pointer crossed a peg (one spin_tick each). */
  tickFrames: number[];
}

const clampDraw = (draw: number): number =>
  Number.isFinite(draw) ? Math.min(Math.max(draw, 0), 1 - Number.EPSILON) : 0;

/** The rest angle that puts the pointer on `draw` of the way round the wheel (clockwise from wedge 0). */
export function landingDeg(draw: number): number {
  const d = clampDraw(draw);
  return (360 - d * 360) % 360;
}

/** Whole turns for a draw: 3..5 for the round wheel, 2..3 for the bonus wheel; deterministic. */
export function turnsFor(draw: number, kind: SpinKind): number {
  const jitter = (clampDraw(draw) * 9973) % 1;
  return kind === 'wheel' ? 3 + Math.floor(jitter * 3) : 2 + Math.floor(jitter * 2);
}

const ease = (p: number): number => 1 - (1 - p) ** 3;

export function angleAtFrame(plan: SpinPlan, frame: number): number {
  const f = Math.min(Math.max(frame, 0), plan.frames);
  return plan.startDeg + (plan.endDeg - plan.startDeg) * ease(f / plan.frames);
}

export interface PlanSpinInput {
  draw: number;
  wedgeCount: number;
  startDeg?: number;
  kind?: SpinKind;
  /** Reduced motion: one short turn instead of the long spin. */
  reducedMotion?: boolean;
}

export function planSpin(input: PlanSpinInput): SpinPlan {
  const kind = input.kind ?? 'wheel';
  const reduced = input.reducedMotion === true;
  const startDeg = (((input.startDeg ?? 0) % 360) + 360) % 360;
  const fullTurns = reduced ? 1 : turnsFor(input.draw, kind);
  const landing = landingDeg(input.draw);
  const delta = (((landing - startDeg) % 360) + 360) % 360;
  const endDeg = startDeg + fullTurns * 360 + delta;
  const durationMs = reduced
    ? REDUCED_SPIN_MS
    : kind === 'bonus'
      ? BONUS_SPIN_MS
      : WHEEL_BASE_MS + fullTurns * WHEEL_PER_TURN_MS;
  const frames = Math.round(durationMs / SPIN_FRAME_MS);
  const plan: SpinPlan = {
    kind,
    draw: clampDraw(input.draw),
    wedgeCount: input.wedgeCount,
    startDeg,
    endDeg,
    fullTurns,
    durationMs: frames * SPIN_FRAME_MS,
    frameMs: SPIN_FRAME_MS,
    frames,
    tickFrames: [],
  };
  const step = 360 / input.wedgeCount;
  let previous = Math.floor(startDeg / step);
  for (let f = 1; f <= frames; f++) {
    const now = Math.floor(angleAtFrame(plan, f) / step);
    if (now !== previous) plan.tickFrames.push(f);
    previous = now;
  }
  return plan;
}

/** The wheel angle `elapsedMs` into the spin: stepped, so it only changes once per frame. */
export function angleAt(plan: SpinPlan, elapsedMs: number): number {
  return angleAtFrame(plan, Math.floor(Math.max(0, elapsedMs) / plan.frameMs));
}

export function isSpinDone(plan: SpinPlan, elapsedMs: number): boolean {
  return elapsedMs >= plan.durationMs;
}

/** The wedge index under the pointer when the wheel rests at `deg`. */
export function wedgeUnderPointer(deg: number, wedgeCount: number): number {
  const phi = (((360 - deg) % 360) + 360) % 360;
  return Math.min(Math.floor(phi / (360 / wedgeCount)), wedgeCount - 1);
}
