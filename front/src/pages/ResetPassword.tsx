import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AuthLayout } from '@/app/layouts';
import { ResetPasswordForm } from '@/features/auth';
import { useAuth } from '@/hooks/useAuth';
import { apiErrorCodeOf } from '@/shared/lib/httpStatus';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { AuthService } from '@/services';

const LINK_CLASSES =
  'inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2';

/**
 * Where the emailed link lands. Public: the person arriving has no session,
 * and one who does is signed out the moment the reset succeeds.
 *
 * The emailed link carries the token in the fragment, `#token=...`, which a
 * browser never sends to a server, so it stays out of access logs and proxies.
 * It is read once, into state, and then taken out of the address bar with a
 * history replace. It is a credential: left in the URL it stays in the browser
 * history and in a bookmark made by reflex. State survives the replace, so the
 * form keeps working; a reload does not, and lands on the same page a link with
 * no token gets.
 */
const ResetPassword = () => {
  const navigate = useNavigate();
  const { clearSession } = useAuth();

  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token'));
  const [linkRefused, setLinkRefused] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useDocumentTitle('Reset password | BreezyBoard');

  useEffect(() => {
    if (window.location.hash || window.location.search) {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
  }, []);

  const resetPassword = async (newPassword: string) => {
    setApiError(null);

    try {
      await AuthService.resetPassword(token ?? '', newPassword);
    } catch (error) {
      if (apiErrorCodeOf(error) === 'INVALID_RESET_TOKEN') {
        setLinkRefused(true);
      } else {
        setApiError('We could not reset your password. Please try again.');
      }
      return;
    }

    // The server has just revoked every session of this account, this
    // browser's included, so the stored one is already dead. Dropping it here
    // keeps the header from offering a signed in state that the next request
    // would contradict.
    clearSession();
    navigate('/login', { replace: true, state: { passwordReset: true } });
  };

  const usable = Boolean(token) && !linkRefused;

  return (
    <AuthLayout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md mx-auto"
      >
        {usable ? (
          <>
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Choose a new password</h1>
              <p className="text-gray-600">You will be asked to sign in again with it.</p>
            </div>

            <ResetPasswordForm onSubmit={resetPassword} error={apiError} onDirty={() => setApiError(null)} />
          </>
        ) : (
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">This link cannot be used</h1>
            <p className="text-gray-600 mb-8">
              A password reset link works once and expires soon. This one is incomplete, already used or out of date.
              Request a new one from the sign in page.
            </p>
            <Link to="/login" state={{ forgotPassword: true }} className={LINK_CLASSES}>
              Request a new link
            </Link>
          </div>
        )}
      </motion.div>
    </AuthLayout>
  );
};

export default ResetPassword;
