import React from 'react';
import { motion } from 'framer-motion';

export interface EmptyStateProps {
  /** Decorative. Shown in a circle above the title and hidden from assistive technology. */
  icon: React.ReactNode;
  title: string;
  description?: string;
  /** The one thing worth doing from here, usually a button. */
  action?: React.ReactNode;
}

/**
 * What a list shows when it has nothing to show.
 *
 * The title is a heading rather than styled text, because this replaces the
 * content of a region and someone navigating by headings has to be able to
 * find out why it is empty.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
    <div
      className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4"
      aria-hidden="true"
    >
      {icon}
    </div>
    <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
    {description && <p className="text-gray-600 mb-6">{description}</p>}
    {action}
  </motion.div>
);

export default EmptyState;
