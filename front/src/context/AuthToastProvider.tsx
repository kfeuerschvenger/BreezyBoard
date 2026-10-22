import type { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { ToastProvider } from '@/shared/ui';

/**
 * The application's toasts, tied to the session. A toast can name a person's
 * boards and carry an action that acts as them, so signing out, or signing in
 * as somebody else, discards every one rather than leaving it for whoever is
 * at the screen next. `ToastProvider` lives in shared and knows nothing of
 * authentication, so the identity is handed to it here.
 */
export const AuthToastProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();

  return <ToastProvider resetKey={user?._id ?? null}>{children}</ToastProvider>;
};

export default AuthToastProvider;
