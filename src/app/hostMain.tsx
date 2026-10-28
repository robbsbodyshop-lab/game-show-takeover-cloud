import { registerFeudConsole } from '@/games/feud/FeudConsole';
import { registerWheelConsole } from '@/games/wheel/registerWheelConsole';
import { HostView } from '@/host/HostView';
import { mountLight } from './mountLight';

// The host console at /host (host.html). A separate entry: it needs no content, engines or audio,
// but it does need the game consoles, which register themselves here as they do on the stage.
registerFeudConsole();
registerWheelConsole();
mountLight('host', <HostView />);
