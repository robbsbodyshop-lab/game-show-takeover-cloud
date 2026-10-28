import { describe, expect, it } from 'vitest';
import { drawForIndex, pegTicks, spinResult, buildWheel } from '@/engines/wheel/wheels';
import { seededRng } from '@/content/testUtils';
import {
  SPIN_FRAME_MS,
  angleAt,
  angleAtFrame,
  isSpinDone,
  landingDeg,
  planSpin,
  turnsFor,
  wedgeUnderPointer,
} from './spinPlan';

describe('planSpin', () => {
  it('is deterministic from the draw', () => {
    expect(planSpin({ draw: 0.4321, wedgeCount: 24, startDeg: 77 })).toEqual(
      planSpin({ draw: 0.4321, wedgeCount: 24, startDeg: 77 }),
    );
  });

  it('turns 3 to 5 whole times and runs about 6.7 to 7.7 seconds on the round wheel', () => {
    const rng = seededRng(5);
    const seen = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const plan = planSpin({ draw: rng(), wedgeCount: 24 });
      expect(plan.fullTurns).toBeGreaterThanOrEqual(3);
      expect(plan.fullTurns).toBeLessThanOrEqual(5);
      seen.add(plan.fullTurns);
      expect(plan.durationMs).toBeGreaterThanOrEqual(6700);
      expect(plan.durationMs).toBeLessThanOrEqual(7700);
      expect(plan.endDeg - plan.startDeg).toBeGreaterThanOrEqual(plan.fullTurns * 360);
      expect(plan.endDeg - plan.startDeg).toBeLessThan(plan.fullTurns * 360 + 360);
    }
    expect([...seen].sort()).toEqual([3, 4, 5]);
  });

  it('lands the pointer on the wedge the engine picks for the same draw, from any rest angle', () => {
    const wheel = buildWheel(2);
    const rng = seededRng(21);
    for (let i = 0; i < 500; i++) {
      // Keep clear of the dividers: the engine and the picture round the same way away from them.
      const index = Math.floor(rng() * 24);
      const draw = (index + 0.15 + rng() * 0.7) / 24;
      const plan = planSpin({ draw, wedgeCount: 24, startDeg: rng() * 1000 });
      expect(wedgeUnderPointer(plan.endDeg, 24)).toBe(index);
      expect(spinResult(wheel, draw).index).toBe(index);
      expect(plan.endDeg % 360).toBeCloseTo(landingDeg(draw), 6);
    }
  });

  it('lands in the right third of the Million Dollar Wedge', () => {
    for (const third of [0, 1, 2] as const) {
      const draw = drawForIndex(12, third);
      const plan = planSpin({ draw, wedgeCount: 24 });
      const phi = (360 - (plan.endDeg % 360)) % 360;
      const within = (phi - 12 * 15) / 15;
      expect(Math.floor(within * 3)).toBe(third);
    }
  });

  it('eases out in steps: one angle per frame, never going backwards, ending exactly on the target', () => {
    const plan = planSpin({ draw: 0.7, wedgeCount: 24, startDeg: 30 });
    expect(angleAt(plan, 0)).toBe(30);
    expect(angleAt(plan, SPIN_FRAME_MS - 1)).toBe(30);
    let last = -1;
    const distinct = new Set<number>();
    for (let t = 0; t <= plan.durationMs + 500; t += 10) {
      const a = angleAt(plan, t);
      expect(a).toBeGreaterThanOrEqual(last);
      last = a;
      distinct.add(a);
    }
    expect(distinct.size).toBe(plan.frames + 1);
    expect(angleAt(plan, plan.durationMs)).toBe(plan.endDeg);
    // Eased out: the first frame moves much further than the last.
    const first = angleAtFrame(plan, 1) - angleAtFrame(plan, 0);
    const final = angleAtFrame(plan, plan.frames) - angleAtFrame(plan, plan.frames - 1);
    expect(first).toBeGreaterThan(final * 20);
    expect(isSpinDone(plan, plan.durationMs - 1)).toBe(false);
    expect(isSpinDone(plan, plan.durationMs)).toBe(true);
  });

  it('plans a spin_tick for the pegs the pointer passes', () => {
    const plan = planSpin({ draw: 0.31, wedgeCount: 24 });
    const pegs = pegTicks(plan.startDeg, plan.endDeg, 24);
    expect(plan.tickFrames.length).toBeGreaterThan(30);
    expect(plan.tickFrames.length).toBeLessThanOrEqual(pegs);
    expect(plan.tickFrames).toEqual([...plan.tickFrames].sort((a, b) => a - b));
    expect(new Set(plan.tickFrames).size).toBe(plan.tickFrames.length);
  });

  it('the bonus wheel spins for the 5 second cue; reduced motion makes a short single turn', () => {
    const bonus = planSpin({ draw: 0.6, wedgeCount: 24, kind: 'bonus' });
    expect(bonus.durationMs).toBe(5000);
    expect([2, 3]).toContain(bonus.fullTurns);
    const reduced = planSpin({ draw: 0.6, wedgeCount: 24, reducedMotion: true });
    expect(reduced.fullTurns).toBe(1);
    expect(reduced.durationMs).toBeLessThan(1500);
    expect(wedgeUnderPointer(reduced.endDeg, 24)).toBe(Math.floor(0.6 * 24));
  });

  it('copes with a draw outside [0, 1)', () => {
    expect(planSpin({ draw: Number.NaN, wedgeCount: 24 }).draw).toBe(0);
    expect(planSpin({ draw: 7, wedgeCount: 24 }).draw).toBeLessThan(1);
    expect(turnsFor(-3, 'wheel')).toBeGreaterThanOrEqual(3);
  });
});
