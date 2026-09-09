import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

// Exact class string harvested from src/components/FormInput.tsx.
const BASE_CLASSES =
  'w-full pl-4 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors';

/**
 * Input
 * Thin wrapper over the native input carrying the existing input class string.
 * Incoming className is merged after the base classes so callers can override.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(({ hasError = false, className = '', ...rest }, ref) => {
  const borderClass = hasError ? 'border-red-500' : 'border-gray-300';

  return <input ref={ref} className={`${BASE_CLASSES} ${borderClass} ${className}`} {...rest} />;
});

Input.displayName = 'Input';
