import React from 'react';
import { DEEP_TEXT, TINT_BACKGROUND } from './hue';
import type { Hue } from './hue';

export interface EmptyStateProps {
  /** Decorative. Shown in a circle above the title and hidden from assistive technology. */
  icon: React.ReactNode;
  title: string;
  description?: string;
  /** The one thing worth doing from here, usually a button. */
  action?: React.ReactNode;
  /**
   * A one row banner for a state that sits beside content rather than in place
   * of it: smaller icon, no vertical padding to speak of, the action on the
   * right. The full size is for a region with nothing else in it.
   */
  compact?: boolean;
  /** The title's heading level. Defaults to 3; use 2 where no level 2 precedes it. */
  headingLevel?: 2 | 3;
  /** The hue of the circle behind the icon. An icon with no colour of its own takes the hue's deep step. */
  tone?: Hue;
}

/**
 * What a list shows when it has nothing to show.
 *
 * The title is a heading rather than styled text, because this replaces the
 * content of a region and someone navigating by headings has to be able to
 * find out why it is empty.
 *
 * It arrives on `bbUp`, the entrance of every empty state in the reference
 * design, as CSS: there is nothing to unmount, so no library is needed.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  compact = false,
  headingLevel = 3,
  tone = 'sky',
}) => {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const circle = `${TINT_BACKGROUND[tone]} ${DEEP_TEXT[tone]}`;

  if (compact) {
    return (
      <div className="flex animate-bb-fade flex-wrap items-center gap-x-4 gap-y-3">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-full ${circle}`} aria-hidden="true">
          {icon}
        </div>
        <div className="min-w-0 flex-1 basis-48">
          <Heading className="font-heading text-[15px] font-bold text-ink">{title}</Heading>
          {description && <p className="text-sm text-ink-secondary">{description}</p>}
        </div>
        {action}
      </div>
    );
  }

  return (
    <div className="animate-bb-up py-16 text-center">
      <div
        className={`mx-auto mb-4 flex size-16 items-center justify-center rounded-full ${circle}`}
        aria-hidden="true"
      >
        {icon}
      </div>
      <Heading className="mb-2 font-heading text-[26px] font-bold tracking-tight text-ink">{title}</Heading>
      {description && <p className="mb-6 text-ink-secondary">{description}</p>}
      {action}
    </div>
  );
};

export default EmptyState;
