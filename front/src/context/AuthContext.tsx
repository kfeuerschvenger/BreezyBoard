import { createContext } from 'react';
import type { User } from '@/models';

/** The one reason a session is dropped on purpose that the sign in screen explains. */
export type SessionEndReason = 'password-changed';

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
  clearSession: (reason?: SessionEndReason) => void;
  /**
   * Why the session was dropped by `clearSession`, until somebody signs in
   * again. A page behind the sign in guard redirects the moment the session is
   * gone, and the redirect has to carry the confirmation the person is owed:
   * a navigation the caller makes alongside it loses the race to the guard's.
   */
  sessionEndReason: SessionEndReason | null;
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
