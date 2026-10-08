import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { FIELD_BORDER, FIELD_BORDER_ERROR, FIELD_CLASSES } from './fieldStyles';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

/**
 * Input
 * Thin wrapper over the native input carrying the shared field frame.
 * Incoming className is merged after the base classes so callers can override.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(({ hasError = false, className = '', ...rest }, ref) => {
  const borderClass = hasError ? FIELD_BORDER_ERROR : FIELD_BORDER;

  return <input ref={ref} className={`${FIELD_CLASSES} h-12 rounded-field px-4 ${borderClass} ${className}`} {...rest} />;
});

Input.displayName = 'Input';
