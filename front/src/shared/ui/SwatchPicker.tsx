import React, { useId } from 'react';
import { IconLoader2 } from '@tabler/icons-react';
import { Icon } from './Icon';
import { EDGE_BORDER } from './hue';
import type { Hue } from './hue';

export interface SwatchOption {
  /** The value stored when this swatch is chosen. */
  id: string;
  /** The accessible name. A block of colour has none of its own. */
  label: string;
  /** The colour itself, as anything CSS accepts for a background. */
  color: string;
  /**
   * The design system hue this colour belongs to, when it is one. The swatch
   * is then outlined in that hue's edge step; without it the outline is the
   * control border colour.
   */
  hue?: Hue;
}

export type SwatchLayout = 'inline' | 'grid';

export interface SwatchPickerProps {
  /** Groups the radios in the browser, so it must be unique within a form. */
  name: string;
  legend: React.ReactNode;
  options: SwatchOption[];
  value: string;
  onChange: (id: string) => void;
  /** `inline` is a row of swatches, `grid` adds the name under each one. */
  layout?: SwatchLayout;
  error?: string;
  isLoading?: boolean;
}

const LEGEND_CLASSES = 'mb-2 block text-[13px] font-semibold text-ink-secondary';

// The outline is what makes a swatch a shape: the mid step of a hue is 2.35 to
// 2.59:1 on white, and the outline is 3:1 or better on white and on the ground
// for every hue. The chosen swatch gets the white and ink double ring, which
// is ink on white and so readable without colour. Hover grows it a little.
const INLINE_OPTION_CLASSES =
  'focus-ring-within inline-block size-8 cursor-pointer rounded-full border-[1.5px] ' +
  'transition-[scale,box-shadow] duration-200 hover:scale-115 has-[:checked]:shadow-swatch-ring';

const INLINE_FALLBACK_BORDER = 'border-line-control';

const GRID_OPTION_CLASSES =
  'focus-ring-within relative block cursor-pointer rounded-control border-[1.5px] border-line-control p-3 ' +
  'transition-[border-color,box-shadow] duration-200 hover:border-ink-secondary ' +
  'has-[:checked]:border-ink has-[:checked]:shadow-swatch-ring';

/**
 * A colour chosen from a set, as one radio group.
 *
 * Selection is expressed with real radio inputs inside labels, hidden from
 * sight but not from the accessibility tree. That is what buys keyboard
 * operation: arrow keys move within the group, the group is announced as a
 * group and the legend names it, all from the browser rather than from code
 * here. A grid of clickable divs under an orphan label buys none of it.
 *
 * A swatch is a block of colour and nothing else, so its name has to be
 * supplied. In the grid layout the name is also visible; inline it is carried
 * for assistive technology alone, which is the only difference between them
 * that is not presentational.
 */
export const SwatchPicker: React.FC<SwatchPickerProps> = ({
  name,
  legend,
  options,
  value,
  onChange,
  layout = 'inline',
  error,
  isLoading = false,
}) => {
  const errorId = useId();

  if (isLoading) {
    return (
      <fieldset>
        <legend className={LEGEND_CLASSES}>{legend}</legend>
        <div className="flex justify-center py-4 text-accent">
          <div role="status">
            <Icon as={IconLoader2} size={24} className="animate-bb-spin" aria-hidden="true" />
            <span className="sr-only">Loading colours</span>
          </div>
        </div>
      </fieldset>
    );
  }

  return (
    <fieldset>
      <legend className={LEGEND_CLASSES}>{legend}</legend>

      <div className={layout === 'grid' ? 'grid grid-cols-3 gap-3' : 'flex flex-wrap gap-2.5'}>
        {options.map(option => (
          <label
            key={option.id}
            className={
              layout === 'grid'
                ? GRID_OPTION_CLASSES
                : `${INLINE_OPTION_CLASSES} ${option.hue ? EDGE_BORDER[option.hue] : INLINE_FALLBACK_BORDER}`
            }
            style={layout === 'grid' ? undefined : { backgroundColor: option.color }}
          >
            <input
              type="radio"
              name={name}
              value={option.id}
              className="sr-only"
              checked={value === option.id}
              onChange={() => onChange(option.id)}
              aria-describedby={error ? errorId : undefined}
            />
            {layout === 'grid' ? (
              <>
                <span
                  className={`block h-8 w-full rounded-button-small border ${option.hue ? EDGE_BORDER[option.hue] : INLINE_FALLBACK_BORDER}`}
                  style={{ backgroundColor: option.color }}
                />
                <span className="mt-2 block text-center text-xs text-ink-secondary">{option.label}</span>
              </>
            ) : (
              <span className="sr-only">{option.label}</span>
            )}
          </label>
        ))}
      </div>

      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-[13px] font-medium text-danger-strong">
          {error}
        </p>
      )}
    </fieldset>
  );
};

export default SwatchPicker;
