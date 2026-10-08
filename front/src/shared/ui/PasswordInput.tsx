import { forwardRef, useState } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { Icon } from './Icon';

export interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  hasError?: boolean;
  /** Drawn inside the field on the left, decoration only. */
  icon?: ReactNode;
  /**
   * Distinguishes one toggle from another when a form has two password
   * fields, since "Show password" twice on a page names neither.
   */
  toggleLabel?: string;
}

// Harvested from the existing password fields. The horizontal padding leaves
// room for the icon on the left and the toggle on the right.
const BASE_CLASSES =
  'w-full pr-12 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors';

/**
 * A password field with the control that reveals it.
 *
 * The wrapper is `relative` and the toggle is inside it, which is the whole
 * point rather than a detail. Two of the three hand-written copies of this
 * put an absolutely positioned toggle next to the field instead of inside a
 * positioned parent, so both landed against an ancestor further up: above
 * the first field and on top of each other. That is finding P4-13, and it is
 * invisible to every test below a real browser, because nothing else
 * computes layout.
 *
 * The toggle is named. The third copy, on the login page, had no accessible
 * name at all, which is the `button-name` the accessibility gate was
 * carrying on that surface.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ hasError = false, icon, toggleLabel = 'password', className = '', ...rest }, ref) => {
    const [revealed, setRevealed] = useState(false);
    const borderClass = hasError ? 'border-red-500' : 'border-gray-300';

    return (
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" aria-hidden="true">
            {icon}
          </div>
        )}

        <input
          ref={ref}
          type={revealed ? 'text' : 'password'}
          className={`${BASE_CLASSES} ${icon ? 'pl-10' : 'pl-4'} ${borderClass} ${className}`}
          {...rest}
        />

        <button
          type="button"
          onClick={() => setRevealed(previous => !previous)}
          aria-label={`${revealed ? 'Hide' : 'Show'} ${toggleLabel}`}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          {revealed ? <Icon as={IconEyeOff} className="h-5 w-5" aria-hidden="true" /> : <Icon as={IconEye} className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
    );
  }
);

PasswordInput.displayName = 'PasswordInput';

export default PasswordInput;
