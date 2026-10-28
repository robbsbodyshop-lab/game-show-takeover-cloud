import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/design';
import { GAME_TITLE } from './constants';
import type { PuzzleController } from './controller';
import { DISPLAY_SCALE, PIXEL_SCALE, sceneFor } from './layout';
import styles from './PuzzleCanvas.module.css';
import { renderScene } from './renderer';
import { loadSpriteSheet } from './spriteCanvas';
import type { SpriteSheet } from './spriteCanvas';

export interface PuzzleCanvasProps {
  controller: PuzzleController;
  /** 1 or 2; fixes the canvas size for the match. */
  players: number;
}

/**
 * The scene canvas: 2x pixel scale, `image-rendering: pixelated`. It redraws on every controller
 * frame from the live match state, so React never re-renders per frame.
 */
export const PuzzleCanvas = ({ controller, players }: PuzzleCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sheet, setSheet] = useState<SpriteSheet | null>(null);
  const reducedMotion = useReducedMotion();
  const scene = sceneFor(players);

  useEffect(() => {
    let live = true;
    void loadSpriteSheet().then((loaded) => {
      if (live) setSheet(loaded);
    });
    // Silkscreen draws the HUD digits; ask for it so the first frames do not use the fallback.
    const fonts = (document as { fonts?: FontFaceSet }).fonts;
    void fonts?.load("8px 'Silkscreen'").catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sheet) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const draw = (): void => {
      renderScene(ctx, sheet, {
        match: controller.getMatch(),
        animMs: controller.getAnimMs(),
        bursts: controller.activeBursts(),
        reducedMotion,
      });
    };
    draw();
    return controller.subscribeFrame(draw);
  }, [controller, sheet, reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      width={scene.width * PIXEL_SCALE}
      height={scene.height * PIXEL_SCALE}
      style={{ width: scene.width * DISPLAY_SCALE, height: scene.height * DISPLAY_SCALE }}
      role="img"
      aria-label={`${GAME_TITLE} board${players > 1 ? 's' : ''}`}
      data-testid="puzzle-canvas"
    />
  );
};
