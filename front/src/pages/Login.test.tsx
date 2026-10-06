import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const renderLogin = () =>
  render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );

const emailField = () => screen.getByLabelText('Email address');
const passwordField = () => screen.getByLabelText('Password');
const submit = () => screen.getByRole('button', { name: /Sign in/ });

beforeEach(() => {
  login.mockReset().mockResolvedValue(undefined);
  navigate.mockReset();
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

  it('explains that the feature does not exist yet', async () => {
    const user = userEvent.setup();
    await openForgot(user);

    expect(await screen.findByText(/not implemented yet/)).toBeInTheDocument();
  });

  it('can be dismissed again', async () => {
    const user = userEvent.setup();
    await openForgot(user);
    await screen.findByText(/not implemented yet/);

    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(screen.queryByText(/not implemented yet/)).not.toBeInTheDocument());
  });
});
