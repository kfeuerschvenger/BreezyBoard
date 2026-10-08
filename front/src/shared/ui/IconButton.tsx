import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';

export type IconButtonSize = 'sm' | 'md' | 'lg';
export type IconButtonShape = 'square' | 'round';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string;
  /** 30, 36 or 44 pixels square. The large one is for a control that stands alone on a touch screen. */
  size?: IconButtonSize;
  shape?: IconButtonShape;
}

const SIZE_CLASSES: Record<IconButtonSize, string> = {
  sm: 'size-7.5',
  md: 'size-9',
  lg: 'size-11',
};

const SHAPE_CLASSES: Record<IconButtonShape, string> = {
  square: 'rounded-button-small',
  round: 'rounded-pill',
};

// The glyph inherits the button's colour, so a caller never styles the icon
// to make it muted: secondary text at rest, ink on hover.
const BASE_CLASSES =
  'inline-flex shrink-0 items-center justify-center text-ink-secondary transition-colors duration-200 ' +
  'enabled:hover:bg-line-06 enabled:hover:text-ink focus-ring';

/**
 * IconButton
 * Shared icon-only button primitive. Requires aria-label so it can never be
 * rendered without an accessible name.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ disabled, size = 'md', shape = 'square', className = '', ...rest }, ref) => {
    const cursorClass = disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer';

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={`${BASE_CLASSES} ${SIZE_CLASSES[size]} ${SHAPE_CLASSES[shape]} ${cursorClass} ${className}`}
        {...rest}
      />
    );
  }
);

IconButton.displayName = 'IconButton';
