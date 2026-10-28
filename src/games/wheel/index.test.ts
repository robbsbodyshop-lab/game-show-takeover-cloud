import { describe, expect, it } from 'vitest';
import { renderHostConsole } from '@/host/consoleRegistry';
import { WheelConsole } from './WheelConsole';
import './index';

describe('the Wheel module', () => {
  it("registers its console for the 'wheel' snapshot kind when imported", () => {
    const element = renderHostConsole('wheel', {
      snapshot: { kind: 'wheel', gameRev: 1, inputLocked: false, data: {} },
      send: () => ({ applied: true }),
    });
    expect(element?.type).toBe(WheelConsole);
  });
});
