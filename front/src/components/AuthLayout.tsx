import React, { type ReactNode, useMemo } from 'react';
import { motion } from 'framer-motion';

/**
 * Props for AuthLayout
 * - children: the auth form (login/register) or any content to render on the right.
 * - title / subtitle: optional override for the left-side branding text.
 * - showIllustration: if false, hide the left column on large screens (useful for very small screens).
 */
type AuthLayoutProps = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  showIllustration?: boolean;
};

const listVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.3, // Delay between each child animation
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0 },
};

/**
 * Small, memoized illustration / branding block kept inside the component
 * to keep the layout file self-contained. It's decorative so SVGs are marked aria-hidden.
 */
const Illustration: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => {
  return (
    <div className="text-center lg:text-left">
      <motion.div initial={{ scale: 0.92 }} animate={{ scale: 1 }} transition={{ duration: 0.5 }} className="mb-8">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto lg:mx-0 mb-4">
          <svg
            aria-hidden="true"
            className="w-8 h-8 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            role="img"
          >
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
        <FeatureItem
          title="Kanban Boards"
          description="Organize tasks with drag-and-drop simplicity"
          decorativeSvgAriaHidden
        />
        <FeatureItem
          title="Team Collaboration"
          description="Work together seamlessly in real-time"
          decorativeSvgAriaHidden
        />
        <FeatureItem
          title="Progress Tracking"
          description="Monitor project status and team performance"
          decorativeSvgAriaHidden
        />
      </motion.div>
    </div>
  );
};

const FeatureItem: React.FC<{ title: string; description: string; decorativeSvgAriaHidden?: boolean }> = ({
  title,
  description,
  decorativeSvgAriaHidden = false,
}) => {
  return (
    <motion.div variants={itemVariants} className="flex items-center space-x-4">
      <div className="flex items-center space-x-4">
        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
          <svg
            aria-hidden={decorativeSvgAriaHidden}
            className="w-6 h-6 text-blue-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            role="img"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
            />
          </svg>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-gray-600">{description}</p>
        </div>
      </div>
    </motion.div>
  );
};

/**
 * AuthLayout
 *
 * Generic layout for authentication pages (login/register).
 * - Left side: branding / features (hidden on small screens)
 * - Right side: the form or content you pass as children
 *
 * Notes:
 * - Keep this component presentational and lightweight.
 * - If the right-side form needs focus management (e.g. autofocus first input), do that inside the form component.
 */
const AuthLayout: React.FC<AuthLayoutProps> = ({
  children,
  title = 'BreezyBoard',
  subtitle = 'Streamline your workflow with powerful project management tools',
  showIllustration = true,
}) => {
  // memoize illustration so it doesn't re-render unnecessarily
  const illustration = useMemo(() => <Illustration title={title} subtitle={subtitle} />, [title, subtitle]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl mx-auto grid lg:grid-cols-2 gap-8 items-center">
        {/* Left side - Branding / features (decorative) */}
        {showIllustration && (
          <motion.aside
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="hidden lg:block"
            aria-hidden={false}
          >
            {illustration}
          </motion.aside>
        )}

        {/* Right side - Form/content */}
        <motion.main
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="w-full"
        >
          <div className="bg-white rounded-2xl shadow-xl p-8 lg:p-12">{children}</div>
        </motion.main>
      </div>
    </div>
  );
};

export default AuthLayout;
