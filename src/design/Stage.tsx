import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { computeStageFit, STAGE_HEIGHT, STAGE_WIDTH, type StageFit } from './stageScale';
import styles from './Stage.module.css';

export interface StageProps {
  children?: ReactNode;
}

const measure = (): StageFit => computeStageFit(window.innerWidth, window.innerHeight);

/**
 * One picture: a fixed 1920x1080 frame scaled with a CSS transform to fit the window, letterboxed
 * on the night backdrop. Exposes `--stage-scale` to descendants. The page never scrolls.
 */
export const Stage = ({ children }: StageProps) => {
  const [fit, setFit] = useState<StageFit>(measure);
  const outerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      setFit(measure());
    };
    update();
    window.addEventListener('resize', update);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    if (observer && outerRef.current) observer.observe(outerRef.current);
    return () => {
      window.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, []);

  const frameStyle: CSSProperties = {
    width: STAGE_WIDTH,
    height: STAGE_HEIGHT,
    transform: `translate(${fit.offsetX.toString()}px, ${fit.offsetY.toString()}px) scale(${fit.scale.toString()})`,
  };

  return (
    <div
      ref={outerRef}
      className={styles.outer}
      data-testid="stage-outer"
      style={{ '--stage-scale': fit.scale } as CSSProperties}
    >
      <div className={styles.frame} data-testid="stage-frame" style={frameStyle}>
        {children}
      </div>
    </div>
  );
};
