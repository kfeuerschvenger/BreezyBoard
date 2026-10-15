import { createContext } from 'react';
import type { User } from '@/models';

export interface AuthContextType {
  user: User | null;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  register: (credentials: { firstName: string; lastName: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Drops the session from this browser without telling the server. For when
   * the server has already ended it, as a password reset does, and a logout
   * request would only come back 401.
   */
  clearSession: () => void;
  /**
   * Replaces the signed in person's record in this tab and in the stored
   * session, for a write that changed it, so everything that shows the person
   * (the sidebar's account button, the greeting) shows the change without a
   * reload.
   */
  updateUser: (user: User) => void;
  isAuthenticated: boolean;
  loading: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
