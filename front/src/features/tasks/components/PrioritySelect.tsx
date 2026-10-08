import React from 'react';
import { IconFlag } from '@tabler/icons-react';
import { Icon } from '@/shared/ui';
import { PRIORITY_LABELS, PRIORITY_SELECTED_CLASSES, TASK_PRIORITIES } from '../priority';
import type { TaskPriority } from '../priority';

export type { TaskPriority };

export interface PrioritySelectProps {
  value: TaskPriority;
  onChange: (value: TaskPriority) => void;
}

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
      <Icon as={IconFlag} size={16} className="inline mr-1" aria-hidden="true" />
      Priority
    </legend>
    <div className="flex gap-2">
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
          {PRIORITY_LABELS[priority]}
        </label>
      ))}
    </div>
  </fieldset>
);

export default PrioritySelect;
