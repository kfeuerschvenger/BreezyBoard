import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string;
}

// Exact class string harvested from the icon button in src/components/PageHeader.tsx
// (the back button), with the cursor utility split out so exactly one cursor class
// is emitted depending on the disabled state.
const BASE_CLASSES =
  'p-2 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2';

/**
 * IconButton
 * Shared icon-only button primitive. Requires aria-label so it can never be
 * rendered without an accessible name.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ disabled, className = '', ...rest }, ref) => {
    const cursorClass = disabled ? 'cursor-not-allowed' : 'cursor-pointer';

    return <button ref={ref} disabled={disabled} className={`${BASE_CLASSES} ${cursorClass} ${className}`} {...rest} />;
  }
);

IconButton.displayName = 'IconButton';
