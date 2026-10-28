import { PhoneApp } from '@/phone/PhoneApp';
import { mountLight } from './mountLight';

// The team phone at /play (play.html). A separate entry so a phone never downloads the stage (NFR-004).
mountLight('phone', <PhoneApp />);
