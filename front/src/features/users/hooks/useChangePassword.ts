import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { AuthService } from '@/services';
import { apiErrorCodeOf, httpStatusOf } from '@/shared/lib/httpStatus';

/**
 * What happened to a password change, for the form to say. A success has
 * already left the page. `rate-limited` is the server's cap on failed
 * attempts: the session is intact and the person has to wait.
 */
export type ChangePasswordOutcome = 'wrong-current' | 'rate-limited' | 'failed';

export interface UseChangePasswordResult {
  /** Resolves with why it did not change. Resolves with nothing once it has, because the page is gone by then. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<ChangePasswordOutcome | undefined>;
}

/**
 * Changing the password of the signed in account.
 *
 * The server ends every session of the account when it succeeds, this
 * browser's included, so the stored one is already dead. The session is
 * dropped here and the person is taken to the sign in screen with the
 * confirmation, as after a reset: staying on a signed in page would only wait
 * for the next request to be refused.
 */
export function useChangePassword(): UseChangePasswordResult {
  const navigate = useNavigate();
  const { clearSession } = useAuth();

  const changePassword = async (currentPassword: string, newPassword: string) => {
    try {
      await AuthService.changePassword(currentPassword, newPassword);
    } catch (error) {
      if (apiErrorCodeOf(error) === 'WRONG_CURRENT_PASSWORD') {
        return 'wrong-current';
      }

      return httpStatusOf(error) === 429 ? 'rate-limited' : 'failed';
    }

    // The reason matters: dropping the session sends a page behind the sign in
    // guard to the sign in screen before the navigation below is applied, and
    // the guard's redirect is the one that has to carry the confirmation.
    clearSession('password-changed');
    navigate('/login', { replace: true, state: { passwordReset: true } });
    return undefined;
  };

  return { changePassword };
}

export default useChangePassword;
