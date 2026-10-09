import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthHeading, ResetPasswordForm } from '@/features/auth';
import { useAuth } from '@/hooks/useAuth';
import { apiErrorCodeOf } from '@/shared/lib/httpStatus';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { AuthService } from '@/services';

// The look of a large primary button, on a link: it navigates, so it is an
// anchor, and `Button` renders a `button`.
const LINK_CLASSES =
  'focus-ring inline-flex h-13 items-center justify-center rounded-card bg-ink px-6 text-base font-semibold text-white shadow-button transition-[translate,background-color,box-shadow] duration-200 ease-standard hover:-translate-y-px hover:bg-ink-hover hover:shadow-button-hover';

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
    <div className="flex animate-bb-up flex-col gap-4.5">
      {usable ? (
        <>
          <AuthHeading title="Choose a new password" subtitle="You will be asked to sign in again with it." />

          <ResetPasswordForm onSubmit={resetPassword} error={apiError} onDirty={() => setApiError(null)} />
        </>
      ) : (
        <>
          <AuthHeading
            title="This link cannot be used"
            subtitle="A password reset link works once and expires soon. This one is incomplete, already used or out of date. Request a new one from the sign in page."
          />

          <Link to="/login" state={{ forgotPassword: true }} className={LINK_CLASSES}>
            Request a new link
          </Link>
        </>
      )}
    </div>
  );
};

export default ResetPassword;
