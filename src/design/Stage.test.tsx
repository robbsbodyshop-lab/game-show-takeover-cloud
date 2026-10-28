import { cleanup, act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Stage } from './Stage';
import { computeStageFit, computeStageScale } from './stageScale';

afterEach(cleanup);

const setWindow = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
};

describe('computeStageScale', () => {
  it('is 1 at exactly 1920x1080', () => {
    expect(computeStageScale(1920, 1080)).toBe(1);
  });

  it('fits by the tighter axis', () => {
    expect(computeStageScale(960, 1080)).toBe(0.5);
    expect(computeStageScale(1920, 540)).toBe(0.5);
    expect(computeStageScale(3840, 1080)).toBe(1);
    expect(computeStageScale(3840, 2160)).toBe(2);
    expect(computeStageScale(390, 844)).toBeCloseTo(390 / 1920, 6);
  });

  it('never returns NaN or a negative scale', () => {
    expect(computeStageScale(0, 1080)).toBe(0);
    expect(computeStageScale(-5, 100)).toBe(0);
    expect(computeStageScale(Number.NaN, 100)).toBe(0);
  });
});

describe('computeStageFit', () => {
  it('letterboxes the short axis', () => {
    const wide = computeStageFit(3840, 1080);
    expect(wide).toEqual({ scale: 1, offsetX: 960, offsetY: 0 });
    const tall = computeStageFit(1920, 1580);
    expect(tall.offsetX).toBe(0);
    expect(tall.offsetY).toBe(250);
  });
});

describe('Stage', () => {
  const original = { w: window.innerWidth, h: window.innerHeight };
  afterEach(() => {
    setWindow(original.w, original.h);
  });

  it('scales the 1920x1080 frame to the window and follows resizes', () => {
    setWindow(960, 540);
    render(
      <Stage>
        <p>Hello</p>
      </Stage>,
    );
    const frame = screen.getByTestId('stage-frame');
    expect(frame).toHaveStyle({ width: '1920px', height: '1080px' });
    expect(frame.style.transform).toBe('translate(0px, 0px) scale(0.5)');
    expect(screen.getByTestId('stage-outer').style.getPropertyValue('--stage-scale')).toBe('0.5');

    act(() => {
      setWindow(3840, 2160);
      window.dispatchEvent(new Event('resize'));
    });
    expect(frame.style.transform).toBe('translate(0px, 0px) scale(2)');
    expect(screen.getByTestId('stage-outer').style.getPropertyValue('--stage-scale')).toBe('2');
  });
});
