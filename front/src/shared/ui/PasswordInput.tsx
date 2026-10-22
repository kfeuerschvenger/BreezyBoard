import { forwardRef, useState } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { Icon } from './Icon';
import { FIELD_BORDER, FIELD_BORDER_ERROR, FIELD_CLASSES } from './fieldStyles';

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

// The field frame is shared with `Input`. The right padding leaves room for
// the toggle and the left padding, set below, for the icon.
const BASE_CLASSES = `${FIELD_CLASSES} h-12 rounded-field pr-12`;

/**
 * A password field with the control that reveals it.
 *
 * The wrapper is `relative` and the toggle is inside it, which is the whole
 * point rather than a detail. Two of the three hand-written copies of this
 * put an absolutely positioned toggle next to the field instead of inside a
 * positioned parent, so both landed against an ancestor further up: above
 * the first field and on top of each other. That is
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
    const borderClass = hasError ? FIELD_BORDER_ERROR : FIELD_BORDER;

    return (
      <div className="relative">
        {icon && (
          <div
            className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-ink-tertiary"
            aria-hidden="true"
          >
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
          className="focus-ring-inset absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-button-small text-ink-tertiary transition-colors hover:text-ink"
        >
          <Icon as={revealed ? IconEyeOff : IconEye} className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    );
  }
);

PasswordInput.displayName = 'PasswordInput';

export default PasswordInput;
