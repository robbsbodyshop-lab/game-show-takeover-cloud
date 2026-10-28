import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildWheel, drawForIndex, spinResult } from '@/engines/wheel/wheels';
import { BonusWheel } from './BonusWheel';
import { GameWheel } from './GameWheel';
import { planSpin, wedgeUnderPointer } from './spinPlan';

describe('GameWheel', () => {
  it('draws 24 wedges, the bulb ring, the pointer and the hub', () => {
    const { container } = render(<GameWheel wedges={buildWheel(1)} angleDeg={0} />);
    expect(screen.getAllByTestId('wedge')).toHaveLength(24);
    expect(container.querySelectorAll('rect')).toHaveLength(48);
    expect(container.querySelectorAll('polygon')).toHaveLength(4);
  });

  it('shows the special wedges of the round with their labels', () => {
    render(<GameWheel wedges={buildWheel(1)} angleDeg={0} />);
    const kinds = screen.getAllByTestId('wedge').map((w) => w.getAttribute('data-kind'));
    expect(kinds.filter((k) => k === 'bankrupt')).toHaveLength(2);
    for (const kind of ['lose-turn', 'wild-card', 'million', 'trip']) expect(kinds).toContain(kind);
    expect(screen.getAllByText('BANKRUPT')).toHaveLength(2);
    expect(screen.getByText('$2,500')).toBeInTheDocument();
    expect(screen.getByText('1M')).toBeInTheDocument();
  });

  it('labels the Mystery and Express wedges of the later rounds', () => {
    const { unmount } = render(<GameWheel wedges={buildWheel(2)} angleDeg={0} />);
    expect(screen.getAllByText('MYSTERY')).toHaveLength(2);
    unmount();
    render(<GameWheel wedges={buildWheel(3)} angleDeg={0} />);
    expect(screen.getByText('EXPRESS')).toBeInTheDocument();
  });

  it('rotates the wedge layer with a CSS transform to the angle it is given', () => {
    render(<GameWheel wedges={buildWheel(1)} angleDeg={723.5} spinning />);
    const rotor = screen.getByTestId('wheel-rotor');
    expect(rotor.style.transform).toBe('rotate(723.5deg)');
    expect(screen.getByTestId('game-wheel')).toHaveAttribute('data-spinning', 'true');
  });

  it('lands the pointer on the wedge the engine picked for the same draw', () => {
    const wheel = buildWheel(2);
    for (const index of [0, 5, 11, 23]) {
      const draw = drawForIndex(index);
      const plan = planSpin({ draw, wedgeCount: 24 });
      expect(spinResult(wheel, draw).index).toBe(index);
      expect(wedgeUnderPointer(plan.endDeg, 24)).toBe(index);
      const { unmount } = render(<GameWheel wedges={wheel} angleDeg={plan.endDeg} />);
      expect(screen.getByTestId('wheel-rotor').style.transform).toBe(`rotate(${String(plan.endDeg)}deg)`);
      unmount();
    }
  });

  it('renders an empty wheel before the round has one', () => {
    const { container } = render(<GameWheel wedges={null} angleDeg={0} />);
    expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(24);
  });
});

describe('BonusWheel', () => {
  it('draws 24 sealed envelopes and prints no value anywhere', () => {
    const { container } = render(<BonusWheel angleDeg={90} />);
    const envelopes = screen.getAllByTestId('envelope');
    expect(envelopes).toHaveLength(24);
    expect(within(envelopes[0]!).getByText('1')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\$|000|CAR/i);
    expect(screen.getByTestId('bonus-rotor').style.transform).toBe('rotate(90deg)');
  });
});
