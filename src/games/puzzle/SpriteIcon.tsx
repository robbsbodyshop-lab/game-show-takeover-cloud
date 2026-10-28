import { SPRITES, SPRITE_SHEET_URL } from './sprites';
import type { SpriteId } from './sprites';

export interface SpriteIconProps {
  id: SpriteId;
  /** CSS pixels per sprite pixel. */
  scale?: number;
  className?: string;
}

/** One sprite from the sheet as an inline SVG `<use>`, hard-edged. Decorative. */
export const SpriteIcon = ({ id, scale = 3, className }: SpriteIconProps) => {
  const { w, h } = SPRITES[id];
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      width={w * scale}
      height={h * scale}
      viewBox={`0 0 ${w.toString()} ${h.toString()}`}
      shapeRendering="crispEdges"
      data-sprite={id}
    >
      <use href={`${SPRITE_SHEET_URL}#${id}`} />
    </svg>
  );
};
