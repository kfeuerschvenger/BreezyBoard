import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';

// Characterization, written against the page as it stands before section
// 12.5 moves it onto React Hook Form and the shared Modal.
const login = vi.fn();
const navigate = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ login }),
  default: () => ({ login }),
}));

const forgotPassword = vi.fn();

vi.mock('@/services', () => ({
  AuthService: { forgotPassword: (email: string) => forgotPassword(email) },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const renderLogin = (state?: { passwordReset?: boolean; forgotPassword?: boolean }) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state }]}>
      <Login />
    </MemoryRouter>
  );

const emailField = () => screen.getByLabelText('Email address');
const passwordField = () => screen.getByLabelText('Password');
const submit = () => screen.getByRole('button', { name: /Sign in/ });

beforeEach(() => {
  login.mockReset().mockResolvedValue(undefined);
  navigate.mockReset();
  forgotPassword.mockReset().mockResolvedValue(undefined);
});

describe('Login validation', () => {
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

describe('Login submitting', () => {
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

describe('Login forgot password', () => {
  const openForgot = async (user: ReturnType<typeof userEvent.setup>) => {
    renderLogin();
    await user.click(screen.getByText('Forgot password?'));
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

describe('Login after a password reset', () => {
  it('says the password was changed', () => {
    renderLogin({ passwordReset: true });

    expect(screen.getByRole('status')).toHaveTextContent('Your password has been changed. Sign in with your new password.');
  });

  it('says nothing about a reset on an ordinary visit', () => {
    renderLogin();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
