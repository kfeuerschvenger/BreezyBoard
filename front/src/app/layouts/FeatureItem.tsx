import React from 'react';
import { motion } from 'motion/react';

export interface FeatureItemProps {
  title: string;
  description: string;
}

const itemVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0 },
};

/**
 * One selling point beside the sign in form.
 *
 * The heading is an h2 under the layout's h1, which is the whole of the
 * `heading-order` the accessibility gate was carrying on the login page, the
 * register page and the dialog over them. It was an h3, and a jump from h1
 * to h3 is a level skipped.
 *
 * The icon is decoration and is hidden outright. It used to carry
 * `aria-hidden` from a prop that defaulted to false and was passed true at
 * all three call sites, so the default was unreachable and the only thing it
 * could ever do was produce an unnamed `role="img"` for anyone who forgot it.
 */
export const FeatureItem: React.FC<FeatureItemProps> = ({ title, description }) => (
  <motion.div variants={itemVariants} className="flex items-center space-x-4">
    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center shrink-0" aria-hidden="true">
      <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
        />
      </svg>
    </div>
    <div>
      <h2 className="font-semibold text-gray-900">{title}</h2>
      <p className="text-gray-600">{description}</p>
    </div>
  </motion.div>
);

export default FeatureItem;
