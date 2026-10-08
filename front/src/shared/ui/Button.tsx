import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  isLoading?: boolean;
  leftIcon?: ReactNode;
}

// Exact class strings harvested from existing primary CTA buttons
// (src/pages/Board.tsx and src/pages/BoardDashboard.tsx) and the
// secondary/cancel button in src/components/AddMemberModal.tsx.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl',
  secondary: 'px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-body',
  ghost: 'px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors',
  // White on red-600 measures 4.83:1, above the 4.5:1 AA threshold for text.
  danger: 'flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors',
};

/**
 * Button
 * Shared button primitive. Emits exactly one cursor class depending on the
 * disabled state, instead of the conflicting cursor-pointer / cursor-not-allowed
 * pair emitted by the existing hand-rolled buttons.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', isLoading = false, leftIcon, disabled, className = '', children, ...rest }, ref) => {
    const isDisabled = Boolean(disabled) || isLoading;
    const cursorClass = isDisabled ? 'cursor-not-allowed' : 'cursor-pointer';

    return (
      <button ref={ref} disabled={isDisabled} className={`${VARIANT_CLASSES[variant]} ${cursorClass} ${className}`} {...rest}>
        {isLoading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
        {!isLoading && leftIcon}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
