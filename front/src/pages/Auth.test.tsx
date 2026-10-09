import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthLayout } from '@/app/layouts';
import Auth from './Auth';

const login = vi.fn();
const register = vi.fn();
const navigate = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ login, register }),
  default: () => ({ login, register }),
}));

const forgotPassword = vi.fn();

vi.mock('@/services', () => ({
  AuthService: { forgotPassword: (email: string) => forgotPassword(email) },
}));

// The legal dialogs read a text file from the public folder. A stub keeps the
// real network out and gives the dialog something to show.
vi.mock('@/hooks/useTextFile', () => ({
  default: () => ({ data: 'The document', loading: false, error: null, refetch: vi.fn() }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;

// The two routes the screen answers on, under the frame they live in, as the
// application mounts them.
const renderAuth = (path = '/login', state?: { passwordReset?: boolean; forgotPassword?: boolean }) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Auth mode="signin" />} />
          <Route path="/register" element={<Auth mode="signup" />} />
        </Route>
      </Routes>
      <Where />
    </MemoryRouter>
  );

const renderLogin = (state?: { passwordReset?: boolean; forgotPassword?: boolean }) => renderAuth('/login', state);

const emailField = () => screen.getByLabelText('Email address');
const passwordField = () => screen.getByLabelText('Password');
const submit = () => screen.getByRole('button', { name: /Sign in/ });

beforeEach(() => {
  login.mockReset().mockResolvedValue(undefined);
  register.mockReset().mockResolvedValue(undefined);
  navigate.mockReset();
  forgotPassword.mockReset().mockResolvedValue(undefined);
});

describe('Sign in validation', () => {
  it('asks for an email rather than submitting an empty form', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(submit());

    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  // The page's own message could not appear at all while the field was
  // type="email" on a validating form: the browser blocked the submit before
  // the handler ran, so the person got the browser's wording and none of the
  // page's styling, and the branch that wrote this message was unreachable.
  it('refuses something that is not an email, in its own words', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(emailField(), 'not-an-email');
    await user.type(passwordField(), 'correct horse');
    await user.click(submit());

    expect(await screen.findByText('Email is invalid')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('refuses a password too short to be one', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(emailField(), 'ada@example.com');
    await user.type(passwordField(), 'abc');
    await user.click(submit());

    expect(await screen.findByText('Password must be at least 6 characters')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('clears a field error as soon as the field is corrected', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(submit());
    expect(await screen.findByText('Email is required')).toBeInTheDocument();

    await user.type(emailField(), 'a');

    await waitFor(() => expect(screen.queryByText('Email is required')).not.toBeInTheDocument());
  });
});

describe('Sign in submitting', () => {
  it('signs in with what was typed and goes to the board list', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(emailField(), 'ada@example.com');
    await user.type(passwordField(), 'correct horse');
    await user.click(submit());

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'correct horse' })
    );
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('says so and stays put when the credentials are refused', async () => {
    const user = userEvent.setup();
    login.mockRejectedValue(new Error('401'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderLogin();

    await user.type(emailField(), 'ada@example.com');
    await user.type(passwordField(), 'wrong password');
    await user.click(submit());

    expect(await screen.findByText('Invalid credentials. Please try again.')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('says it is working while the request is out, and refuses a second press', async () => {
    const user = userEvent.setup();
    login.mockReturnValue(new Promise(() => {}));
    renderLogin();

    await user.type(emailField(), 'ada@example.com');
    await user.type(passwordField(), 'correct horse');
    await user.click(submit());

    const busy = await screen.findByRole('button', { name: /Signing in/ });
    expect(busy).toBeDisabled();
    expect(login).toHaveBeenCalledTimes(1);
  });
});

describe('Sign in forgot password', () => {
  const openForgot = async (user: ReturnType<typeof userEvent.setup>) => {
    renderLogin();
    await user.click(screen.getByRole('button', { name: 'Forgot it?' }));
  };

  it('opens a dialog that asks for the email address', async () => {
    const user = userEvent.setup();
    await openForgot(user);

    expect(await screen.findByRole('dialog', { name: 'Forgot password' })).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByLabelText('Email address')).toBeInTheDocument();
  });

  it('requests the link for what was typed and confirms without saying whether an account exists', async () => {
    const user = userEvent.setup();
    await openForgot(user);

    await user.type(within(await screen.findByRole('dialog')).getByLabelText('Email address'), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    await waitFor(() => expect(forgotPassword).toHaveBeenCalledWith('ada@example.com'));
    expect(await screen.findByRole('status')).toHaveTextContent(/If an account exists for ada@example.com/);
  });

  it('can be dismissed again', async () => {
    const user = userEvent.setup();
    await openForgot(user);
    await screen.findByRole('dialog');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('opens straight away when the page was reached asking for a new link', async () => {
    renderLogin({ forgotPassword: true });

    expect(await screen.findByRole('dialog', { name: 'Forgot password' })).toBeInTheDocument();
  });
});

describe('Sign in after a password reset', () => {
  it('says the password was changed', () => {
    renderLogin({ passwordReset: true });

    expect(screen.getByRole('status')).toHaveTextContent('Your password has been changed. Sign in with your new password.');
  });

  it('says nothing about a reset on an ordinary visit', () => {
    renderLogin();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('Auth modes', () => {
  it('is sign in on /login and says so in its title, its button and the tab', () => {
    renderAuth('/login');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome back');
    expect(screen.getByRole('button', { name: /^Sign in/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('Confirm password')).not.toBeInTheDocument();
    expect(document.title).toBe('Sign in | BreezyBoard');
  });

  it('is sign up on /register and says so in its title, its button and the tab', () => {
    renderAuth('/register');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Catch your first breeze');
    expect(screen.getByRole('button', { name: /^Create account/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm password')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Forgot it?' })).not.toBeInTheDocument();
    expect(document.title).toBe('Create account | BreezyBoard');
  });

  it('switches to sign up through the address, so the mode survives a reload', async () => {
    const user = userEvent.setup();
    renderAuth('/login');

    await user.click(screen.getByRole('link', { name: 'Create an account' }));

    expect(screen.getByTestId('where')).toHaveTextContent('/register');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Catch your first breeze');
  });

  it('switches back to sign in the same way', async () => {
    const user = userEvent.setup();
    renderAuth('/register');

    await user.click(screen.getByRole('link', { name: 'Sign in' }));

    expect(screen.getByTestId('where')).toHaveTextContent('/login');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome back');
  });

  it('moves focus to the new title, because the link that was pressed is gone', async () => {
    const user = userEvent.setup();
    renderAuth('/login');

    await user.click(screen.getByRole('link', { name: 'Create an account' }));

    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());
  });

  it('leaves focus alone on arrival, so the first thing a visitor reaches is the form', () => {
    renderAuth('/login');

    expect(screen.getByRole('heading', { level: 1 })).not.toHaveFocus();
  });

  it('keeps the branding column mounted while the mode changes', async () => {
    const user = userEvent.setup();
    const { container } = renderAuth('/login');
    const panel = container.querySelector('aside');

    await user.click(screen.getByRole('link', { name: 'Create an account' }));

    expect(container.querySelector('aside')).toBe(panel);
  });

  it('does not carry a refused sign in over to the sign up screen', async () => {
    const user = userEvent.setup();
    login.mockRejectedValue(new Error('401'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderAuth('/login');

    await user.type(emailField(), 'ada@example.com');
    await user.type(passwordField(), 'wrong password');
    await user.click(submit());
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials. Please try again.');

    await user.click(screen.getByRole('link', { name: 'Create an account' }));

    expect(screen.queryByText('Invalid credentials. Please try again.')).not.toBeInTheDocument();
  });
});

// jsdom loads no stylesheet, so the branding column is rendered here exactly as
// it is at a desktop width, where it is on screen beside the form. The element
// is what is counted, not any text on it: a second title is a second `h1`
// whatever it says.
describe('Auth page structure', () => {
  it.each(['/login', '/register'])('has one h1 on %s, and the branding headline is not it', path => {
    const { container } = renderAuth(path);

    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(container.querySelector('main h1')).not.toBeNull();
    expect(container.querySelector('aside h1')).toBeNull();
    expect(container.querySelector('aside p')).not.toBeNull();
  });

  it('puts the form in the main landmark and the branding in a named complementary one', () => {
    renderAuth('/login');

    expect(within(screen.getByRole('main')).getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'About BreezyBoard' })).toBeInTheDocument();
  });

  it('hides the still life from assistive technology, since none of its words are real content', () => {
    renderAuth('/login');

    expect(screen.getByText('Check the wind forecast (again)').closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByText('Organize at the speed of', { exact: false }).closest('[aria-hidden="true"]')).toBeNull();
  });

  it('offers the legal documents on both modes, and the terms dialog opens', async () => {
    const user = userEvent.setup();
    renderAuth('/register');

    await user.click(screen.getByRole('button', { name: 'Terms' }));

    expect(await screen.findByRole('dialog', { name: 'Terms of Service - BreezyBoard' })).toBeInTheDocument();
  });
});

describe('Auth error banner and shake', () => {
  const refuseSignIn = async (user: ReturnType<typeof userEvent.setup>) => {
    login.mockRejectedValue(new Error('401'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderAuth('/login');

    await user.type(emailField(), 'ada@example.com');
    await user.type(passwordField(), 'wrong password');
    await user.click(submit());
  };

  it('announces a refused sign in as an alert in the banner', async () => {
    const user = userEvent.setup();
    await refuseSignIn(user);

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('Invalid credentials. Please try again.');
    expect(banner.closest('form')).not.toBeNull();
  });

  it('shakes the form when the credentials are refused', async () => {
    const user = userEvent.setup();
    await refuseSignIn(user);

    await screen.findByRole('alert');
    expect(document.querySelector('form')).toHaveClass('animate-bb-shake');
  });

  it('shakes the form when a field fails validation, with no banner', async () => {
    const user = userEvent.setup();
    renderAuth('/login');

    await user.click(submit());

    await screen.findByText('Email is required');
    expect(document.querySelector('form')).toHaveClass('animate-bb-shake');
    expect(screen.queryByText('Invalid credentials. Please try again.')).not.toBeInTheDocument();
  });

  it('takes the shake off when its own animation ends, and not when a child finishes one', async () => {
    const user = userEvent.setup();
    renderAuth('/login');
    await user.click(submit());
    await screen.findByText('Email is required');
    const form = document.querySelector('form') as HTMLFormElement;

    form.querySelector('input')?.dispatchEvent(new Event('animationend', { bubbles: true }));
    expect(form).toHaveClass('animate-bb-shake');

    form.dispatchEvent(new Event('animationend'));
    expect(form).not.toHaveClass('animate-bb-shake');
  });

  it('shakes again on a second refusal of the same message', async () => {
    const user = userEvent.setup();
    await refuseSignIn(user);
    await screen.findByRole('alert');
    const form = document.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('animationend'));
    expect(form).not.toHaveClass('animate-bb-shake');

    await user.click(submit());

    await waitFor(() => expect(form).toHaveClass('animate-bb-shake'));
  });

  it('clears the banner on the first keystroke after a failure', async () => {
    const user = userEvent.setup();
    await refuseSignIn(user);
    await screen.findByRole('alert');

    await user.type(passwordField(), '1');

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});

describe('Sign up submitting', () => {
  const fillAll = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText('First name'), 'Ada');
    await user.type(screen.getByLabelText('Last name'), 'Lovelace');
    await user.type(emailField(), 'ada@example.com');
    await user.type(passwordField(), 'Analytical1');
    await user.type(screen.getByLabelText('Confirm password'), 'Analytical1');
  };

  it('stays disabled until every field is valid and the terms are accepted', async () => {
    const user = userEvent.setup();
    renderAuth('/register');
    const create = screen.getByRole('button', { name: /^Create account/ });
    expect(create).toBeDisabled();

    await fillAll(user);
    expect(create).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: /I agree to the Terms of Service/ }));
    await waitFor(() => expect(create).toBeEnabled());
  });

  it('creates the account with the names, the email and the password, and goes to the board list', async () => {
    const user = userEvent.setup();
    renderAuth('/register');

    await fillAll(user);
    await user.click(screen.getByRole('checkbox'));
    await user.click(await screen.findByRole('button', { name: /^Create account/ }));

    await waitFor(() =>
      expect(register).toHaveBeenCalledWith({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        password: 'Analytical1',
      })
    );
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('says so, shakes and stays put when the account could not be created', async () => {
    const user = userEvent.setup();
    register.mockRejectedValue(new Error('500'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderAuth('/register');

    await fillAll(user);
    await user.click(screen.getByRole('checkbox'));
    await user.click(await screen.findByRole('button', { name: /^Create account/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Registration failed. Please try again.');
    expect(document.querySelector('form')).toHaveClass('animate-bb-shake');
    expect(navigate).not.toHaveBeenCalled();
  });
});
