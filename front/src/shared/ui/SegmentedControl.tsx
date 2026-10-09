import React, { useId } from 'react';

export interface SegmentedOption {
  /** The value reported when this segment is chosen. */
  id: string;
  label: React.ReactNode;
  /** Decorative, drawn before the label. */
  icon?: React.ReactNode;
}

/**
 * `xs` is the sidebar's: the same 28 pixel segments as `sm` with the padding
 * taken in, each as wide as its own label, for four options in a narrow box.
 */
export type SegmentedSize = 'xs' | 'sm' | 'md';

export interface SegmentedControlProps {
  /** Names the group for assistive technology. Required: a bare row of options has no meaning. */
  label: string;
  options: SegmentedOption[];
  value: string;
  onChange: (id: string) => void;
  size?: SegmentedSize;
  /** Groups the radios in the browser. Generated when left out. */
  name?: string;
  className?: string;
}

const FRAME_CLASSES: Record<SegmentedSize, string> = {
  xs: 'gap-[3px] rounded-control p-[3px]',
  sm: 'gap-[3px] rounded-control p-[3px]',
  md: 'gap-1 rounded-field p-1',
};

const SEGMENT_CLASSES: Record<SegmentedSize, string> = {
  xs: 'h-7 flex-auto rounded-[8px] px-1.5 text-xs',
  sm: 'h-7 flex-1 rounded-[8px] px-3 text-[13px]',
  md: 'h-[38px] flex-1 rounded-[10px] px-4 text-sm',
};

// A segment is one of a set of mutually exclusive radios, so the group, the
// arrow keys and the checked state all come from the browser. The selected
// segment is lifted on white with an ink ring: the reference draws it as white
// on a 5 percent navy, 1.2:1, which says nothing to a person who cannot see
// the shadow. The ring is ink on white and the frame is `line-control`, 3.3:1.
const SELECTED_CLASSES =
  'has-[:checked]:bg-surface has-[:checked]:text-ink has-[:checked]:shadow-segment has-[:checked]:ring-1 has-[:checked]:ring-ink';

/**
 * A short row of exclusive choices, such as the Breeze setting.
 *
 * It is a radio group with real radio inputs, visually hidden, inside labels
 * drawn as segments. That is what makes the arrow keys move the selection and
 * announce it, Tab enter and leave the group as one stop, and the group named
 * by `label`, with no key handling written here to get wrong.
 */
export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  label,
  options,
  value,
  onChange,
  size = 'sm',
  name,
  className = '',
}) => {
  const generated = useId();
  const group = name ?? generated;

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`inline-flex border-[1.5px] border-line-control bg-line-05 ${FRAME_CLASSES[size]} ${className}`}
    >
      {options.map(option => (
        <label
          key={option.id}
          className={`focus-ring-within inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap font-semibold text-ink-secondary transition-colors duration-200 hover:text-ink ${SEGMENT_CLASSES[size]} ${SELECTED_CLASSES}`}
        >
          <input
            type="radio"
            name={group}
            value={option.id}
            checked={value === option.id}
            onChange={() => onChange(option.id)}
            className="sr-only"
          />
          {option.icon && (
            <span aria-hidden="true" className="inline-flex shrink-0">
              {option.icon}
            </span>
          )}
          {option.label}
        </label>
      ))}
    </div>
  );
};

export default SegmentedControl;
