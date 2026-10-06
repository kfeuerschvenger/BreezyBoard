import React from 'react';
import { motion } from 'framer-motion';
import { FeatureItem } from './FeatureItem';

export interface AuthIllustrationProps {
  title: string;
  subtitle: string;
}

const listVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.3 } },
};

const FEATURES = [
  { title: 'Kanban Boards', description: 'Organize tasks with drag-and-drop simplicity' },
  { title: 'Team Collaboration', description: 'Work together seamlessly in real-time' },
  { title: 'Progress Tracking', description: 'Monitor project status and team performance' },
];

/** The branding column beside the sign in and sign up forms. */
export const AuthIllustration: React.FC<AuthIllustrationProps> = ({ title, subtitle }) => (
  <div className="text-center lg:text-left">
    <motion.div initial={{ scale: 0.92 }} animate={{ scale: 1 }} transition={{ duration: 0.5 }} className="mb-8">
      <div
        className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto lg:mx-0 mb-4"
        aria-hidden="true"
      >
        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h2a2 2 0 002-2z"
          />
        </svg>
      </div>

      <h1 className="text-4xl font-bold text-gray-900 mb-4">{title}</h1>
      <p className="text-xl text-gray-600 mb-8">{subtitle}</p>
    </motion.div>

    <motion.div variants={listVariants} initial="hidden" animate="visible" className="space-y-6">
      {FEATURES.map(feature => (
        <FeatureItem key={feature.title} title={feature.title} description={feature.description} />
      ))}
    </motion.div>
  </div>
);

export default AuthIllustration;
