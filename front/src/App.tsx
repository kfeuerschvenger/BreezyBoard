import type { ReactNode } from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';

import { QueryClientProvider } from '@tanstack/react-query';

import { AppShell } from '@/app/layouts/AppShell';
import { createQueryClient } from '@/app/queryClient';
import { AuthProvider } from '@/context/AuthProvider';
import { useAuth } from '@/hooks/useAuth';
import { Board, Home, Login, NotFound, Profile, Register, ResetPassword } from '@/pages';
import { ToastProvider } from '@/shared/ui';

import './index.css';

// Component to protect routes that require authentication
const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      {/* Public by necessity: the person arriving from the emailed link has
          no session, and one who has is signed out when the reset succeeds. */}
      <Route path="/reset-password" element={<ResetPassword />} />
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
    </Routes>
  );
};

// Created once, outside the component, so a re-render never throws the whole
// cache away.
const queryClient = createQueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <Router>
            <AppShell>
              <AppRoutes />
            </AppShell>
          </Router>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
