import { HostView } from '@/host/HostView';
import { mountLight } from './mountLight';

// The host console at /host (host.html). A separate entry: it needs no content, engines or audio.
mountLight('host', <HostView />);
