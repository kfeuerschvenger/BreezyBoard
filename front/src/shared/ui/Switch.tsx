import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'role' | 'onChange' | 'type'> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/**
 * The off track is `line-control`, 3.34:1 on white, because the reference's
 * 16 percent navy is 1.4:1 and a switch that cannot be seen is not off, it is
 * missing. The on track is the strong accent, 3.54:1 on white, and the white
 * knob is 3.54:1 on it and 3.34:1 on the off track.
 */
const TRACK_ON = 'bg-accent-strong';
const TRACK_OFF = 'bg-line-control';

/**
 * An on and off switch: a button with `role="switch"` and `aria-checked`.
 *
 * It is not named here. Give it an `aria-label`, an `aria-labelledby`, or wrap
 * it in a `label`, as for any button: a switch with no name is announced as
 * "switch, on" and nothing else.
 *
 * The track fades over 250 milliseconds and the knob travels 18 pixels on the
 * spring easing, which overshoots a little and settles. Both are CSS, so
 * nothing runs per frame in script, and the reduced motion rule collapses them.
 */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, disabled, className = '', ...rest }, ref) => (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`focus-ring relative inline-flex h-[26px] w-11 shrink-0 items-center rounded-pill transition-colors duration-250 ${
        checked ? TRACK_ON : TRACK_OFF
      } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${className}`}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute left-[3px] top-[3px] size-5 rounded-full bg-surface shadow-knob transition-transform duration-300 ease-spring ${
          checked ? 'translate-x-[18px]' : 'translate-x-0'
        }`}
      />
    </button>
  )
);

Switch.displayName = 'Switch';

export default Switch;
