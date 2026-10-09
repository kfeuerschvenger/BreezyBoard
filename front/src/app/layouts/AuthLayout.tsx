import React from 'react';
import { Outlet } from 'react-router-dom';
import { AuthBrandPanel } from './AuthBrandPanel';
import { LogoGlyph, Wordmark } from './shell/BrandMark';

/**
 * The frame of every page a visitor with no session sees: sign in, sign up and
 * the two password reset pages.
 *
 * It is a layout route, so the branding column is mounted once and stays put
 * while the page beside it changes. Switching between sign in and sign up
 * replaces the form and leaves the postcard, the floating cards and the wind
 * running, which is what makes the two modes read as one screen.
 *
 * Branding on the left, hidden below the large breakpoint, and the page on the
 * right under a small wordmark that only a narrow screen shows. This frame owns
 * the `main` landmark and nothing else: the page's heading, its form and where
 * focus lands belong to the page.
 */
export const AuthLayout: React.FC = () => (
  <div className="grid min-h-screen bg-ground lg:grid-cols-2">
    <AuthBrandPanel />

    <main className="flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <span className="flex size-9 items-center justify-center rounded-control bg-[image:var(--gradient-logo)] text-white shadow-logo">
            <LogoGlyph size={21} />
          </span>
          <Wordmark className="text-[21px] text-ink" />
        </div>

        <Outlet />
      </div>
    </main>
  </div>
);

export default AuthLayout;
