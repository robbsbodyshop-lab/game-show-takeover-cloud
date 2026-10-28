export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;

export interface StageFit {
  scale: number;
  /** Letterbox offsets in CSS pixels, so the scaled frame is centred. */
  offsetX: number;
  offsetY: number;
}

/** Uniform scale that fits the 1920x1080 frame inside a w x h window (never negative or NaN). */
export const computeStageScale = (width: number, height: number): number => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 0;
  return Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT);
};

/** Scale plus centring offsets for the letterboxed frame. */
export const computeStageFit = (width: number, height: number): StageFit => {
  const scale = computeStageScale(width, height);
  return {
    scale,
    offsetX: Math.max(0, (width - STAGE_WIDTH * scale) / 2),
    offsetY: Math.max(0, (height - STAGE_HEIGHT * scale) / 2),
  };
};
