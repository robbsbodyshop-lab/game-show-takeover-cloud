import type { WheelUiSnapshot } from './WheelController';
import type { SpinKind } from './spinPlan';

export interface WheelSpinView {
  /** Rotation to paint, degrees clockwise. The controller steps it once per animation frame. */
  angleDeg: number;
  spinning: boolean;
}

/**
 * The animation of a spin as the components see it (FR-042). The plan itself (3-5 turns, stepped
 * easing, the landing angle, the per-peg ticks) lives in `spinPlan.ts` and is driven by the
 * controller, which also holds the result back until the wheel stops, so a pause freezes the wheel and
 * the cues together. This hook just picks the right wheel out of the snapshot.
 */
export function useWheelSpin(snapshot: WheelUiSnapshot, which: SpinKind = 'wheel'): WheelSpinView {
  return {
    angleDeg: which === 'bonus' ? snapshot.bonusDeg : snapshot.wheelDeg,
    spinning: snapshot.spinning && snapshot.spinKind === which,
  };
}
