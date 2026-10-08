import React from 'react';
import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { AuthIllustration } from './AuthIllustration';

export interface AuthLayoutProps {
  /** The form, or anything else that belongs in the right hand column. */
  children: ReactNode;
  title?: string;
  subtitle?: string;
  /** False drops the branding column entirely, rather than only hiding it. */
  showIllustration?: boolean;
}

/**
 * The two column frame the sign in and sign up pages sit in.
 *
 * Branding on the left, hidden below the large breakpoint, and the form on
 * the right. Presentational: anything a form needs, including where the
 * focus lands, belongs in that form.
 */
export const AuthLayout: React.FC<AuthLayoutProps> = ({
  children,
  title = 'BreezyBoard',
  subtitle = 'Streamline your workflow with powerful project management tools',
  showIllustration = true,
}) => (
  <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
    <div className="w-full max-w-6xl mx-auto grid lg:grid-cols-2 gap-8 items-center">
      {showIllustration && (
        <motion.aside
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="hidden lg:block"
        >
          <AuthIllustration title={title} subtitle={subtitle} />
        </motion.aside>
      )}

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

export default AuthLayout;
