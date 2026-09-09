import { forwardRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

// Exact class string harvested from src/components/CreateBoardModal.tsx.
const BASE_CLASSES =
  'w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none';

/**
 * Textarea
 * Thin wrapper over the native textarea carrying the existing textarea class string.
 * Incoming className is merged after the base classes so callers can override.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ hasError = false, className = '', ...rest }, ref) => {
    const borderClass = hasError ? 'border-red-500' : 'border-gray-300';

    return <textarea ref={ref} className={`${BASE_CLASSES} ${borderClass} ${className}`} {...rest} />;
  }
);

Textarea.displayName = 'Textarea';
