/** Wheel of Fortune game module: what the stage and the host panel import. */
import { registerWheelConsole } from './registerWheelConsole';

// Importing the module makes its console available; `registerWheelConsole()` does the same on demand.
registerWheelConsole();

export { WheelGame, type WheelGameProps } from './WheelGame';
export { WheelController } from './WheelController';
export { WheelConsole } from './WheelConsole';
export { registerWheelConsole } from './registerWheelConsole';
export {
  DEFAULT_WHEEL_SETTINGS,
  parseWheelSettings,
  wheelSettingsSchema,
  type WheelSettings,
} from './settings';
export type { WheelHostData } from './hostData';
