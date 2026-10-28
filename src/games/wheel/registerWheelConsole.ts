import { registerHostConsole } from '@/host/consoleRegistry';
import { WheelConsole } from './WheelConsole';

/**
 * Puts the Wheel console in the host console registry; the F2 drawer and the host view look it up by the
 * `'wheel'` snapshot kind. Safe to call more than once (it replaces itself).
 */
export const registerWheelConsole = (): (() => void) => registerHostConsole('wheel', WheelConsole);
