import type { HTMLAttributes } from 'react';
import { cx } from './cx';
import styles from './dither.module.css';

export type DitherVariant = 'texture' | 'checker' | 'fade';

export interface DitherProps extends HTMLAttributes<HTMLDivElement> {
  variant?: DitherVariant;
}

const VARIANT_CLASS: Record<DitherVariant, string> = {
  texture: styles.dither ?? '',
  checker: styles.checker ?? '',
  fade: styles.fade ?? '',
};

/** Decorative ordered-dither overlay; fills its positioned parent. Pass `className` to size it. */
export const Dither = ({ variant = 'texture', className, ...rest }: DitherProps) => (
  <div
    aria-hidden="true"
    data-variant={variant}
    className={cx(styles.overlay, VARIANT_CLASS[variant], className)}
    {...rest}
  />
);
