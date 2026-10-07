import type { ReactNode } from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes, useMatch } from 'react-router-dom';

import Footer from '@/components/Footer';
import { QueryClientProvider } from '@tanstack/react-query';

import { createQueryClient } from '@/app/queryClient';
import { AuthProvider } from '@/context/AuthProvider';
import { useAuth } from '@/hooks/useAuth';
import { Board, Home, Login, Profile, Register } from '@/pages';

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

/**
 * The frame every page sits in, with the footer under it.
 *
 * The board is the one page that is exactly as tall as the screen: its columns
 * scroll inside themselves, so a frame that grew with its content would push
 * the footer below the fold and give the document a second vertical scrollbar
 * beside the columns'. On that route the frame is pinned to the viewport
 * instead, and the board takes whatever the footer leaves.
 */
const AppShell = ({ children }: { children: ReactNode }) => {
  const onBoard = useMatch('/board/:boardId') !== null;

  return (
    <div className={`flex flex-col bg-gray-50 ${onBoard ? 'h-dvh overflow-hidden' : 'min-h-screen'}`}>
      {children}
      <Footer />
    </div>
  );
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
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
      <Route path="*" element={<Navigate to="/" replace />} />
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
        <Router>
          <AppShell>
            <AppRoutes />
          </AppShell>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
