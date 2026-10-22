import React from 'react';
import { IconCheck, IconFlag } from '@tabler/icons-react';
import { Icon } from '@/shared/ui';
import { PRIORITY_LABELS, PRIORITY_SELECTED_CLASSES, TASK_PRIORITIES } from '../priority';
import type { TaskPriority } from '../priority';

export type { TaskPriority };

export interface PrioritySelectProps {
  value: TaskPriority;
  onChange: (value: TaskPriority) => void;
}

const LEGEND_CLASSES = 'mb-2 block text-[13px] font-semibold text-ink-secondary';

// A pill with the control border at rest, so it reads as something to press
// before it is chosen. The chosen one takes its hue's tint, deep text and edge
// outline, and a check as well: the hue is the second signal and the check is
// the first, so a person who cannot tell the hues apart still sees which is on.
const OPTION_CLASSES =
  'group focus-ring-within inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-pill border-[1.5px] ' +
  'border-line-control bg-surface px-4 text-sm font-semibold text-ink-secondary ' +
  'transition-[background-color,border-color,color] duration-200 hover:border-ink-secondary md:h-9';

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
      <Icon as={IconFlag} size={16} className="mr-1 inline" aria-hidden="true" />
      Priority
    </legend>
    <div className="flex flex-wrap gap-2">
      {TASK_PRIORITIES.map(priority => (
        <label key={priority} className={`${OPTION_CLASSES} ${PRIORITY_SELECTED_CLASSES[priority]}`}>
          <input
            type="radio"
            name="priority"
            value={priority}
            className="sr-only"
            checked={value === priority}
            onChange={() => onChange(priority)}
          />
          <Icon as={IconCheck} size={14} className="hidden group-has-[:checked]:block" aria-hidden="true" />
          {PRIORITY_LABELS[priority]}
        </label>
      ))}
    </div>
  </fieldset>
);

export default PrioritySelect;
