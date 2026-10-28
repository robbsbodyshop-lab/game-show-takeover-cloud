import { capsuleArt } from './capsuleArt.ts';
import { burstArt, crownArt, heartArt, markerArt, pipArt } from './effectsArt.ts';
import { flaskArt } from './flaskArt.ts';
import { germArt } from './germArt.ts';
import type { SpriteArt } from './pixelGrid.ts';

/** Every sprite in the sheet, in packing order (the packer sorts tall sprites first, stably). */
export const buildArt = (): SpriteArt[] => [
  ...capsuleArt(),
  ...germArt(),
  ...burstArt(),
  ...flaskArt(),
  crownArt(),
  ...markerArt(),
  heartArt(),
  pipArt(),
];
