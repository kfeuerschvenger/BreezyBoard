import React from 'react';
import { Flag } from 'lucide-react';

export type TaskPriority = 'low' | 'medium' | 'high';

export interface PrioritySelectProps {
  value: TaskPriority;
  onChange: (value: TaskPriority) => void;
}

// Every class is written out in full, and that is a constraint rather than a
// preference. Tailwind generates a rule only for a class it can read in the
// source, so a variant composed at runtime, `has-[:checked]:${option.color}`,
// produces markup referring to a rule that was never generated. Composing it
// from a value holding two classes is worse still: only the first inherits the
// variant and the second applies unconditionally, which paints every option
// instead of the selected one.
const OPTIONS: ReadonlyArray<{ value: TaskPriority; label: string; selectedClasses: string }> = [
  {
    value: 'low',
    label: 'Low',
    selectedClasses: 'has-[:checked]:bg-green-100 has-[:checked]:text-green-800',
  },
  {
    value: 'medium',
    label: 'Medium',
    selectedClasses: 'has-[:checked]:bg-yellow-100 has-[:checked]:text-yellow-800',
  },
  {
    value: 'high',
    label: 'High',
    selectedClasses: 'has-[:checked]:bg-red-100 has-[:checked]:text-red-800',
  },
];

const LEGEND_CLASSES = 'block text-sm font-medium text-gray-700 mb-2 font-heading';

const OPTION_CLASSES =
  'px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer bg-gray-100 text-gray-600 ' +
  'hover:bg-gray-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500';

/**
 * The three task priorities, as one radio group.
 *
 * Selection is expressed with real radio inputs inside labels, hidden from
 * sight but not from the accessibility tree: arrow keys move within the group,
 * the group is announced as a group and the legend names it, all from the
 * browser rather than from code here.
 */
export const PrioritySelect: React.FC<PrioritySelectProps> = ({ value, onChange }) => (
  <fieldset>
    <legend className={LEGEND_CLASSES}>
      <Flag size={16} className="inline mr-1" aria-hidden="true" />
      Priority
    </legend>
    <div className="flex gap-2">
      {OPTIONS.map(option => (
        <label key={option.value} className={`${OPTION_CLASSES} ${option.selectedClasses}`}>
          <input
            type="radio"
            name="priority"
            value={option.value}
            className="sr-only"
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
    </div>
  </fieldset>
);

export default PrioritySelect;
