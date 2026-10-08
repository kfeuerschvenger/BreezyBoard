import React from 'react';
import { motion } from 'motion/react';

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
}

/**
 * What a list shows when it has nothing to show.
 *
 * The title is a heading rather than styled text, because this replaces the
 * content of a region and someone navigating by headings has to be able to
 * find out why it is empty.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  compact = false,
  headingLevel = 3,
}) => {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-wrap items-center gap-x-4 gap-y-3"
      >
        <div
          className="w-10 h-10 shrink-0 bg-gray-100 rounded-full flex items-center justify-center"
          aria-hidden="true"
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1 basis-48">
          <Heading className="font-semibold text-gray-900">{title}</Heading>
          {description && <p className="text-sm text-gray-600">{description}</p>}
        </div>
        {action}
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
      <div
        className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4"
        aria-hidden="true"
      >
        {icon}
      </div>
      <Heading className="text-lg font-semibold text-gray-900 mb-2">{title}</Heading>
      {description && <p className="text-gray-600 mb-6">{description}</p>}
      {action}
    </motion.div>
  );
};

export default EmptyState;
