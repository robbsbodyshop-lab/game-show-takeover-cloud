import { useEffect, useRef } from 'react';
import { toCanvas } from 'qrcode';
import { logger } from '@/lib/logger';
import styles from './QrCanvas.module.css';

export interface QrCanvasProps {
  value: string;
  /** Edge length in canvas pixels. */
  size?: number;
}

// Ink on cream, the two highest-contrast tokens (--c-ink, --c-cream); canvas cannot read CSS variables.
const DARK = '#0b0620';
const LIGHT = '#fff6dc';

/** QR code drawn on a canvas, so it never goes through innerHTML (conventions: no HTML strings). */
export const QrCanvas = ({ value, size = 320 }: QrCanvasProps) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    toCanvas(canvas, value, {
      width: size,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: DARK, light: LIGHT },
    }).catch((error: unknown) => {
      logger.debug('[stage] QR code could not be drawn', error);
    });
  }, [value, size]);

  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      role="img"
      aria-label={`QR code that opens ${value}`}
      className={styles.qr}
    />
  );
};
