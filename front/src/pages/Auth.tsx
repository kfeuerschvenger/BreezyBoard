import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import LegalLinks from '@/components/LegalLinks';
import { AuthHeading, ForgotPasswordModal, LoginForm, RegisterForm } from '@/features/auth';
import { useAuth } from '@/hooks/useAuth';
import { AuthService } from '@/services';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import type { LoginCredentials, RegisterCredentials } from '@/models';

export type AuthMode = 'signin' | 'signup';

export interface AuthProps {
  mode: AuthMode;
}

// What a page that sends someone here can ask of it, through the router's
// location state: show the confirmation of a finished reset, or open the
// dialog that asks for a new link.
interface AuthLocationState {
  passwordReset?: boolean;
  forgotPassword?: boolean;
}

interface ModeCopy {
  title: string;
  subtitle: string;
  documentTitle: string;
  switchText: string;
  switchLabel: string;
  switchTo: string;
}

const COPY: Record<AuthMode, ModeCopy> = {
  signin: {
    title: 'Welcome back',
    subtitle: "The wind's been tidying up while you were away.",
    documentTitle: 'Sign in | BreezyBoard',
    switchText: 'New to BreezyBoard?',
    switchLabel: 'Create an account',
    switchTo: '/register',
  },
  signup: {
    title: 'Catch your first breeze',
    subtitle: 'Free for personal boards. Set up in under a minute.',
    documentTitle: 'Create account | BreezyBoard',
    switchText: 'Already have an account?',
    switchLabel: 'Sign in',
    switchTo: '/login',
  },
};

/**
 * Sign in and sign up, as one screen with two modes.
 *
 * The route chooses the mode, `/login` or `/register`, and the switch under the
 * form is a link to the other route, so the address always says which mode is
 * showing and a reload or a shared link lands on the same one. The branding
 * column belongs to the layout route above, which is why the two modes read as
 * one screen: only what is beside it changes.
 *
 * A failure belongs to the mode it happened in. Switching modes clears it, so a
 * refused password never greets someone who has moved over to create an
 * account. Switching also moves focus to the new title: the link that was
 * pressed has just left the page, and focus left on nothing would restart a
 * keyboard or screen reader user from the top of the document.
 */
const Auth = ({ mode }: AuthProps) => {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const state = useLocation().state as AuthLocationState | null;

  const [failure, setFailure] = useState<{ mode: AuthMode; message: string } | null>(null);
  const [forgotOpen, setForgotOpen] = useState(Boolean(state?.forgotPassword));
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownMode = useRef(mode);

  const copy = COPY[mode];
  const error = failure?.mode === mode ? failure.message : null;

  useDocumentTitle(copy.documentTitle);

  useEffect(() => {
    if (shownMode.current === mode) return;
    shownMode.current = mode;
    headingRef.current?.focus();
  }, [mode]);

  const signIn = async (credentials: LoginCredentials) => {
    setFailure(null);
    try {
      await login(credentials);
      navigate('/');
    } catch (cause) {
      console.error('Login failed:', cause);
      setFailure({ mode: 'signin', message: 'Invalid credentials. Please try again.' });
    }
  };

  const signUp = async (credentials: RegisterCredentials) => {
    setFailure(null);
    try {
      await register(credentials);
      navigate('/');
    } catch (cause) {
      console.error('Registration failed:', cause);
      setFailure({ mode: 'signup', message: 'Registration failed. Please try again.' });
    }
  };

  const clearFailure = () => setFailure(null);

  return (
    <div key={mode} className="flex animate-bb-up flex-col gap-4.5">
      <AuthHeading title={copy.title} subtitle={copy.subtitle} headingRef={headingRef} />

      {mode === 'signin' && state?.passwordReset && (
        <div role="status" className="rounded-control bg-success-bg px-3.5 py-2.5 text-sm font-medium text-success-strong">
          Your password has been changed. Sign in with your new password.
        </div>
      )}

      {mode === 'signin' ? (
        <LoginForm
          onSubmit={signIn}
          error={error}
          onDirty={clearFailure}
          onForgotPassword={() => setForgotOpen(true)}
        />
      ) : (
        <RegisterForm onSubmit={signUp} error={error} onDirty={clearFailure} />
      )}

      <p className="text-center text-sm text-ink-secondary">
        {copy.switchText}{' '}
        <Link
          to={copy.switchTo}
          className="focus-ring inline-flex min-h-8 items-center rounded-chip px-1 font-semibold text-link transition-colors hover:text-ink"
        >
          {copy.switchLabel}
        </Link>
      </p>

      <div className="flex justify-center">
        <LegalLinks />
      </div>

      <ForgotPasswordModal
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        onSubmit={email => AuthService.forgotPassword(email)}
      />
    </div>
  );
};

export default Auth;
