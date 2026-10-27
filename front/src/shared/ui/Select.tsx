import { forwardRef } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { FIELD_BORDER, FIELD_BORDER_ERROR, FIELD_CLASSES } from './fieldStyles';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  hasError?: boolean;
}

/**
 * Select
 * The native select in the shared field frame. It stays native on purpose: the
 * browser supplies the keyboard behaviour, the picker on a phone and the
 * announcements, none of which a styled list reproduces.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(({ hasError = false, className = '', ...rest }, ref) => {
  const borderClass = hasError ? FIELD_BORDER_ERROR : FIELD_BORDER;

  return <select ref={ref} className={`${FIELD_CLASSES} h-12 cursor-pointer rounded-field px-3 ${borderClass} ${className}`} {...rest} />;
});

Select.displayName = 'Select';
