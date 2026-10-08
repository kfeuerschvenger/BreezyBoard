import { forwardRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import { FIELD_BORDER, FIELD_BORDER_ERROR, FIELD_CLASSES } from './fieldStyles';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

/**
 * Textarea
 * Thin wrapper over the native textarea carrying the shared field frame.
 * Incoming className is merged after the base classes so callers can override.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ hasError = false, className = '', ...rest }, ref) => {
    const borderClass = hasError ? FIELD_BORDER_ERROR : FIELD_BORDER;

    return (
      <textarea
        ref={ref}
        className={`${FIELD_CLASSES} resize-none rounded-field px-4 py-3 leading-normal ${borderClass} ${className}`}
        {...rest}
      />
    );
  }
);

Textarea.displayName = 'Textarea';
