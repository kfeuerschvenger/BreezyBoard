import React, { useId } from 'react';

export interface SwatchOption {
  /** The value stored when this swatch is chosen. */
  id: string;
  /** The accessible name. A block of colour has none of its own. */
  label: string;
  /** The colour itself, as anything CSS accepts for a background. */
  color: string;
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

const LEGEND_CLASSES = 'block text-sm font-medium text-gray-700 mb-2 font-heading';

const INLINE_OPTION_CLASSES =
  'w-8 h-8 rounded-full border-2 transition-transform cursor-pointer inline-block ' +
  'border-gray-300 hover:border-gray-400 has-[:checked]:border-gray-900 has-[:checked]:scale-110 ' +
  'has-[:checked]:ring-2 has-[:checked]:ring-blue-500 ' +
  'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500';

const GRID_OPTION_CLASSES =
  'relative block cursor-pointer rounded-lg border-2 p-3 transition-all ' +
  'border-gray-200 hover:border-gray-300 has-[:checked]:border-blue-500 ' +
  'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500';

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
        <div className="flex justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" role="status">
            <span className="sr-only">Loading colours</span>
          </div>
        </div>
      </fieldset>
    );
  }

  return (
    <fieldset>
      <legend className={LEGEND_CLASSES}>{legend}</legend>

      <div className={layout === 'grid' ? 'grid grid-cols-4 gap-3' : 'flex flex-wrap gap-2'}>
        {options.map(option => (
          <label
            key={option.id}
            className={layout === 'grid' ? GRID_OPTION_CLASSES : INLINE_OPTION_CLASSES}
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
                <span className="block w-full h-8 rounded" style={{ backgroundColor: option.color }} />
                <span className="block text-xs text-gray-600 mt-2 text-center">{option.label}</span>
              </>
            ) : (
              <span className="sr-only">{option.label}</span>
            )}
          </label>
        ))}
      </div>

      {error && (
        <p id={errorId} role="alert" className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </fieldset>
  );
};

export default SwatchPicker;
