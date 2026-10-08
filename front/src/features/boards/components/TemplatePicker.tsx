import React from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { resolveIcon } from '@/shared/lib/templateIcons';
import { Icon } from '@/shared/ui';
import type { Template } from '@/models';

export interface TemplatePickerProps {
  templates: Template[];
  /** The id currently chosen, for the styling the CSS cannot express alone. */
  value: string;
  /** The form library's registration for the radio group. */
  registration: UseFormRegisterReturn;
}

// The legend carries the same weight as a Field's label, so the group reads
// as part of the same form rather than as decoration.
const LEGEND_CLASSES = 'block text-sm font-medium text-gray-700 mb-2 font-heading';

// Selection is expressed with real radio inputs inside labels, hidden from
// sight but not from the accessibility tree. That is what buys keyboard
// operation: arrow keys move within the group, the group is announced as a
// group, and the legend names it, all from the browser and none of it from
// code here. The buttons this replaced were a grid of clickable divs under
// an orphan label, which was two of the ten label-has-associated-control
// warnings the gate used to hold.
const OPTION_CLASSES =
  'relative block cursor-pointer rounded-lg border-2 transition-all border-gray-200 hover:border-gray-300 ' +
  'has-[:checked]:border-blue-500 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500';

const idOf = (template: Template) => template._id ?? template.name;

/** The board templates, as one radio group. */
export const TemplatePicker: React.FC<TemplatePickerProps> = ({ templates, value, registration }) => (
  <fieldset>
    <legend className={LEGEND_CLASSES}>Board Template</legend>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {templates.map(template => {
        const id = idOf(template);
        const TemplateIcon = resolveIcon(template.iconName);
        const isSelected = value === id;

        return (
          <label key={id} className={`${OPTION_CLASSES} p-4 text-left has-[:checked]:bg-blue-50`}>
            <input type="radio" value={id} className="sr-only" {...registration} />
            <span className="flex items-start gap-3">
              <span className={`p-2 rounded-lg ${isSelected ? 'bg-blue-100' : 'bg-gray-100'}`}>
                <Icon as={TemplateIcon} size={20} aria-hidden="true" className={isSelected ? 'text-blue-600' : 'text-gray-600'} />
              </span>
              <span className="flex-1">
                {/* h3, not h4. The dialog's own title is an h2, and jumping a
                    level is what axe reports as heading-order. */}
                <h3 className="font-medium text-gray-900 mb-1">{template.name}</h3>
                <span className="block text-sm text-gray-600 mb-2">{template.description}</span>
                <span className="flex flex-wrap gap-1">
                  {template.columns.map((column, index) => (
                    <span key={index} className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">
                      {typeof column === 'string' ? column : column.title}
                    </span>
                  ))}
                </span>
              </span>
            </span>
          </label>
        );
      })}
    </div>
  </fieldset>
);

export default TemplatePicker;
