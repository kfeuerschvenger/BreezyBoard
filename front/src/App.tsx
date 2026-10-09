import type { ReactNode } from 'react';
import { Navigate, Outlet, Route, BrowserRouter as Router, Routes } from 'react-router-dom';

import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';

import { AppShell } from '@/app/layouts/AppShell';
import { createQueryClient } from '@/app/queryClient';
import { AuthProvider } from '@/context/AuthProvider';
import { AuthToastProvider } from '@/context/AuthToastProvider';
import { useAuth } from '@/hooks/useAuth';
import { Board, Home, Login, NotFound, Profile, Register, ResetPassword } from '@/pages';
import { LoadingScreen } from '@/shared/ui';

import './index.css';

// Component to protect routes that require authentication
const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return <LoadingScreen label="Loading" />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
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
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      {/* Public by necessity: the person arriving from the emailed link has
          no session, and one who has is signed out when the reset succeeds. */}
      <Route path="/reset-password" element={<ResetPassword />} />
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
