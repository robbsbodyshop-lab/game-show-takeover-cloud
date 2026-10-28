import { useId } from 'react';
import { Label } from '@/design';
import styles from './TextField.module.css';

export interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email' | 'password';
  error?: string | null;
  autoComplete?: string;
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}

/** Label, input and inline error in one block (errors are announced, never colour only). */
export const TextField = ({
  label,
  value,
  onChange,
  type = 'text',
  error = null,
  autoComplete,
  maxLength,
  placeholder,
  disabled,
  autoFocus,
  className,
}: TextFieldProps) => {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        className={styles.input}
        type={type}
        value={value}
        autoComplete={autoComplete}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      {error ? (
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
};
