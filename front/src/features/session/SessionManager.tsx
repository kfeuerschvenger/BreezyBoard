import useAuth from '../../hooks/useAuth';
import { useKeepAlive } from './useKeepAlive';
import { useSessionExpiry } from './useSessionExpiry';
import { SessionWarningToast } from './SessionWarningToast';

/**
 * Mounted from inside AuthProvider so it has access to useAuth(). Wires the
 * keep-alive event listeners, the session-expiry warning/countdown, and the
 * toast that lets the user extend the session, all in one place.
 */
export function SessionManager() {
  const { isAuthenticated, logout } = useAuth();

  useKeepAlive(isAuthenticated);

  const { warning, secondsRemaining, extend } = useSessionExpiry(isAuthenticated, () => {
    void logout();
  });

  if (!warning || secondsRemaining === null) return null;

  return <SessionWarningToast secondsRemaining={secondsRemaining} onExtend={() => void extend()} />;
}

export default SessionManager;
