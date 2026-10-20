import React, { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AuthService } from '@/services';
import type { User } from '@/models';
import { clearAuth } from '@/utils/auth.helper';
import { AuthContext, type AuthContextType, type SessionEndReason } from './AuthContext';
import SessionManager from '@/features/session/SessionManager';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionEndReason, setSessionEndReason] = useState<SessionEndReason | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const initAuth = async () => {
      try {
        const token = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');

        if (token && storedUser) {
          // Verify the token with the backend and refresh the stored user
          // with the canonical object the server just returned.
          const currentUser = await AuthService.me();
          localStorage.setItem('user', JSON.stringify(currentUser));
          setUser(currentUser);
          setIsAuthenticated(true);
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  // Another tab clearing its token (its user signed out) signs this tab out
  // locally too. No need to call the logout endpoint again: the tab that
  // actually acted already revoked the session server-side.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'token' && !event.newValue) {
        queryClient.clear();
        setUser(null);
        setIsAuthenticated(false);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [queryClient]);

  const login = async (credentials: { email: string; password: string }) => {
    const { token, user } = await AuthService.login(credentials);
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setUser(user);
    setIsAuthenticated(true);
    setSessionEndReason(null);
  };

  const register = async (credentials: { firstName: string; lastName: string; email: string; password: string }) => {
    const { token, user } = await AuthService.register(credentials);
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setUser(user);
    setIsAuthenticated(true);
    setSessionEndReason(null);
  };

  // The server state cache is not keyed by person: a board, a task or the
  // dashboard totals are stored under keys that name no user, and stay fresh
  // for 30 seconds. Every way a session ends therefore empties it, or the
  // next person to sign in on this tab is shown the previous one's boards.
  const clearSession = (reason?: SessionEndReason) => {
    clearAuth();
    queryClient.clear();
    setUser(null);
    setIsAuthenticated(false);
    setSessionEndReason(reason ?? null);
  };

  const updateUser = (next: User) => {
    try {
      localStorage.setItem('user', JSON.stringify(next));
    } catch (error) {
      console.warn('Could not store the updated user', error);
    }
    setUser(next);
  };

  const logout = async () => {
    await AuthService.logout();
    queryClient.clear();
    setUser(null);
    setIsAuthenticated(false);
  };

  const value: AuthContextType = {
    user,
    login,
    register,
    logout,
    clearSession,
    sessionEndReason,
    updateUser,
    isAuthenticated,
    loading,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      <SessionManager />
    </AuthContext.Provider>
  );
};

export default AuthProvider;
