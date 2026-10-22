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

// The legend is the swatch picker's legend, so the two groups of the form read
// the same.
const LEGEND_CLASSES = 'mb-2 block text-[13px] font-semibold text-ink-secondary';

// Selection is expressed with real radio inputs inside labels, hidden from
// sight but not from the accessibility tree. That is what buys keyboard
// operation: arrow keys move within the group, the group is announced as a
// group, and the legend names it, all from the browser and none of it from
// code here. The buttons this replaced were a grid of clickable divs under
// an orphan label, which was two of the ten label-has-associated-control
// warnings the gate used to hold.
const OPTION_CLASSES =
  'focus-ring-within relative block cursor-pointer rounded-control border-[1.5px] border-line-control ' +
  'transition-[border-color,box-shadow,background-color] duration-200 hover:border-ink-secondary ' +
  'has-[:checked]:border-ink has-[:checked]:bg-surface-subtle has-[:checked]:shadow-swatch-ring';

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
          <label key={id} className={`${OPTION_CLASSES} p-4 text-left`}>
            <input type="radio" value={id} className="sr-only" {...registration} />
            <span className="flex items-start gap-3">
              <span className={`rounded-control p-2 ${isSelected ? 'bg-sky-tint text-sky-deep' : 'bg-line-06 text-ink-secondary'}`}>
                <Icon as={TemplateIcon} size={20} aria-hidden="true" />
              </span>
              <span className="flex-1">
                {/* h3, not h4. The dialog's own title is an h2, and jumping a
                    level is what axe reports as heading-order. */}
                <h3 className="mb-1 font-semibold text-ink">{template.name}</h3>
                <span className="mb-2 block text-sm text-ink-secondary">{template.description}</span>
                <span className="flex flex-wrap gap-1">
                  {template.columns.map((column, index) => (
                    <span key={index} className="rounded-chip bg-line-06 px-2 py-1 text-xs text-ink-secondary">
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
