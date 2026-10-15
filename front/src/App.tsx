import type { ReactNode } from 'react';
import { Navigate, Outlet, Route, BrowserRouter as Router, Routes } from 'react-router-dom';

import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';

import { AppShell } from '@/app/layouts/AppShell';
import { AuthLayout } from '@/app/layouts/AuthLayout';
import { createQueryClient } from '@/app/queryClient';
import { AuthProvider } from '@/context/AuthProvider';
import { AuthToastProvider } from '@/context/AuthToastProvider';
import { useAuth } from '@/hooks/useAuth';
import { Auth, Board, Home, NotFound, Profile, ResetPassword } from '@/pages';
import { LoadingScreen } from '@/shared/ui';

import './index.css';

// Component to protect routes that require authentication
const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, loading, sessionEndReason } = useAuth();

  if (loading) return <LoadingScreen label="Loading" />;

  if (!isAuthenticated) {
    // A session dropped by a password change redirects here the instant it is
    // gone, ahead of any navigation the page that dropped it makes, so the
    // sign in screen's confirmation has to ride on this redirect.
    const state = sessionEndReason === 'password-changed' ? { passwordReset: true } : undefined;
    return <Navigate to="/login" replace state={state} />;
  }
  return <>{children}</>;
};

/**
 * The frame around every page a signed in person sees, and nothing around the
 * same address for a visitor with no session.
 *
 * Unknown addresses live under it too, so a signed in visitor who mistypes a
 * link keeps the sidebar and the account, and a signed out one gets the bare
 * not found page and is never redirected. The sign in, registration and
 * password reset pages sit outside it: they are the way in, and a sidebar of
 * boards that cannot be read yet would be wrong there.
 */
const SignedInLayout = () => {
  const { isAuthenticated } = useAuth();

  return isAuthenticated ? <AppShell /> : <Outlet />;
};

const AppRoutes = () => {
  return (
    <Routes>
      {/* The pages a visitor with no session uses to get in share one frame,
          so the branding column stays mounted while the page beside it
          changes. Reset is public by necessity: the person arriving from the
          emailed link has no session, and one who has is signed out when the
          reset succeeds. */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Auth mode="signin" />} />
        <Route path="/register" element={<Auth mode="signup" />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Route>
      <Route element={<SignedInLayout />}>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />
        <Route
          path="/board/:boardId"
          element={
            <ProtectedRoute>
              <Board />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        {/* Not behind ProtectedRoute: an unknown address is answered the same
            way for everybody and never redirected, so nobody is bounced to
            login for a page that does not exist. */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
};

// Created once, outside the component, so a re-render never throws the whole
// cache away.
const queryClient = createQueryClient();

const App = () => {
  return (
    // reducedMotion="user" makes every motion component honour the system
    // setting: transforms and layout animations are skipped, opacity still
    // fades, so an exit finishes and AnimatePresence unmounts as usual.
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AuthToastProvider>
            <Router>
              <AppRoutes />
            </Router>
          </AuthToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </MotionConfig>
  );
};

export default App;
