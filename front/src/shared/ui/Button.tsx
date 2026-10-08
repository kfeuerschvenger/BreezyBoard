import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { IconLoader2 } from '@tabler/icons-react';
import { Icon } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'glass' | 'ghost' | 'danger' | 'danger-ghost';

/** The three heights of the reference design: 40, 44 and 52 pixels. */
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: ReactNode;
}

/**
 * Whole class names, never composed from the variant at runtime: Tailwind
 * reads the source for complete class names and cannot see one that only
 * exists once the component runs.
 *
 * `enabled:` guards every hover lift and press, so a disabled button does not
 * respond to a pointer it cannot act on.
 */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // White on ink is 17.3:1, on the hover fill 13.6:1.
  primary:
    'bg-ink text-white shadow-button enabled:hover:-translate-y-px enabled:hover:bg-ink-hover enabled:hover:shadow-button-hover',
  secondary:
    'border-[1.5px] border-line-12 bg-surface text-ink enabled:hover:-translate-y-px enabled:hover:border-line-22 enabled:hover:shadow-[0_10px_24px_-14px_rgb(15_27_45/0.35)]',
  glass:
    'border border-white/95 bg-white/70 text-ink backdrop-blur-sm enabled:hover:-translate-y-px enabled:hover:bg-surface',
  ghost: 'text-ink-secondary enabled:hover:bg-line-06 enabled:hover:text-ink',
  // White on the danger fill measures 6.95:1.
  danger: 'bg-danger text-white enabled:hover:bg-danger-strong',
  // The danger text measures 6.95:1 on white and 5.95:1 on its own tint.
  'danger-ghost': 'text-danger enabled:hover:bg-danger-bg',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-10 rounded-control px-4 text-sm',
  md: 'h-11 rounded-control px-5 text-[15px]',
  lg: 'h-13 rounded-card px-6 text-base',
};

// The transition names its properties. `transition-all` would include the
// outline, and a focus ring that fades in over 200 milliseconds arrives late
// for the one person who needs it to be there when they press Tab.
const BASE_CLASSES =
  'inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap select-none ' +
  'transition-[translate,scale,background-color,border-color,box-shadow,color] duration-200 ease-standard ' +
  'focus-ring enabled:active:scale-[0.97]';

/**
 * Button
 * Shared button primitive. Emits exactly one cursor class depending on the
 * disabled state, and one dimming class when it is disabled without being
 * busy: a button that is loading keeps its full colour, because the spinner
 * inside it is the state.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = 'primary', size = 'md', isLoading = false, leftIcon, disabled, className = '', children, ...rest },
    ref
  ) => {
    const isDisabled = Boolean(disabled) || isLoading;
    const cursorClass = isDisabled ? 'cursor-not-allowed' : 'cursor-pointer';
    const dimClass = isDisabled && !isLoading ? 'opacity-60' : '';

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-busy={isLoading || undefined}
        className={`${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${cursorClass} ${dimClass} ${className}`}
        {...rest}
      >
        {isLoading && <Icon as={IconLoader2} size={18} className="animate-bb-spin" aria-hidden="true" />}
        {!isLoading && leftIcon}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
