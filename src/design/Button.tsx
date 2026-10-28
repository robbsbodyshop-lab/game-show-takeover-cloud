import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'confirm' | 'host' | 'quiet';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** `type` defaults to "button" so a Button inside a form never submits by accident; pass type="submit". */
export const Button = ({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className,
  ...rest
}: ButtonProps) => (
  <button
    type={type}
    data-variant={variant}
    data-size={size}
    className={cx(styles.button, styles[variant], styles[size], className)}
    {...rest}
  />
);
