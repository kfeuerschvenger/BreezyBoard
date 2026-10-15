import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AxiosError } from 'axios';
import { axe } from 'vitest-axe';
import { renderWithQuery } from '@/test/renderWithQuery';
import { AuthService } from '@/services';
import { PasswordPanel } from './PasswordPanel';

vi.mock('@/services', () => ({ AuthService: { changePassword: vi.fn() } }));

const auth = vi.hoisted(() => ({ clearSession: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth, default: () => auth }));

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const mockedAuth = vi.mocked(AuthService);

/** A refusal as axios raises it: the status and the API's error envelope. */
const refusal = (status: number, code: string) =>
  new AxiosError('refused', String(status), undefined, undefined, {
    status,
    data: { success: false, code },
  } as never);

const renderPanel = () =>
  renderWithQuery(
    <MemoryRouter>
      <PasswordPanel />
    </MemoryRouter>
  );

const current = () => screen.getByLabelText('Current password');
const next = () => screen.getByLabelText('New password');
const confirm = () => screen.getByLabelText('Confirm new password');
const submit = () => screen.getByRole('button', { name: 'Change password' });

const fill = async (user: ReturnType<typeof userEvent.setup>, values: [string, string, string]) => {
  await user.type(current(), values[0]);
  await user.type(next(), values[1]);
  await user.type(confirm(), values[2]);
};

beforeEach(() => {
  navigate.mockReset();
  auth.clearSession.mockReset();
  mockedAuth.changePassword.mockReset().mockResolvedValue(undefined);
});

describe('PasswordPanel', () => {
  it('says before the button is pressed that every session ends', () => {
    renderPanel();

    expect(screen.getByText(/signs you out everywhere, this device included/)).toBeInTheDocument();
  });

  it('names its three fields and gives each the right autocomplete hint', () => {
    renderPanel();

    expect(current()).toHaveAttribute('autocomplete', 'current-password');
    expect(next()).toHaveAttribute('autocomplete', 'new-password');
    expect(confirm()).toHaveAttribute('autocomplete', 'new-password');
  });

  it('has no accessibility violations', async () => {
    const { container } = renderPanel();

    expect(await axe(container, { rules: { region: { enabled: false } } })).toHaveNoViolations();
  });

  it('asks for the current password', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(next(), 'NewPassword456');
    await user.type(confirm(), 'NewPassword456');
    await user.click(submit());

    expect(await screen.findByText('Enter your current password')).toBeInTheDocument();
    expect(mockedAuth.changePassword).not.toHaveBeenCalled();
  });

  it.each([
    ['short', 'Password must be at least 8 characters'],
    ['alllowercase1', 'Password must contain an uppercase letter'],
    ['ALLUPPERCASE1', 'Password must contain a lowercase letter'],
    ['NoDigitsHere', 'Password must contain a number'],
  ])('refuses a new password of "%s" before anything is sent', async (candidate, message) => {
    const user = userEvent.setup();
    renderPanel();

    await fill(user, ['OldPassword123', candidate, candidate]);
    await user.click(submit());

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(mockedAuth.changePassword).not.toHaveBeenCalled();
  });

  it('refuses a confirmation that does not match', async () => {
    const user = userEvent.setup();
    renderPanel();

    await fill(user, ['OldPassword123', 'NewPassword456', 'NewPassword457']);
    await user.click(submit());

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(mockedAuth.changePassword).not.toHaveBeenCalled();
  });

  it('sends the current and the new password, and neither the confirmation nor anything else', async () => {
    const user = userEvent.setup();
    renderPanel();

    await fill(user, ['OldPassword123', 'NewPassword456', 'NewPassword456']);
    await user.click(submit());

    await waitFor(() => expect(mockedAuth.changePassword).toHaveBeenCalledWith('OldPassword123', 'NewPassword456'));
  });

  it('drops the session and goes to the sign in screen with the confirmation once it has changed', async () => {
    const user = userEvent.setup();
    renderPanel();

    await fill(user, ['OldPassword123', 'NewPassword456', 'NewPassword456']);
    await user.click(submit());

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/login', { replace: true, state: { passwordReset: true } })
    );
    // With its reason: the guard that redirects the page the instant the
    // session is gone needs it to carry the confirmation.
    expect(auth.clearSession).toHaveBeenCalledExactlyOnceWith('password-changed');
  });

  // A 401 is what the client reads as an ended session and signs the person
  // out for; the server answers a wrong current password with a 400 and its own
  // code, and this panel must treat it as a field to fix.
  it('says a wrong current password under that field, keeps the session and stays', async () => {
    const user = userEvent.setup();
    mockedAuth.changePassword.mockRejectedValue(refusal(400, 'WRONG_CURRENT_PASSWORD'));
    renderPanel();

    await fill(user, ['WrongPassword1', 'NewPassword456', 'NewPassword456']);
    await user.click(submit());

    expect(await screen.findByText('That is not your current password')).toBeInTheDocument();
    expect(current()).toHaveAccessibleDescription('That is not your current password');
    expect(current()).toBeInvalid();
    expect(auth.clearSession).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.queryByText(/We could not change your password/)).not.toBeInTheDocument();
  });

  it('says so in a banner, and stays signed in, when the server refuses for any other reason', async () => {
    const user = userEvent.setup();
    mockedAuth.changePassword.mockRejectedValue(refusal(500, 'INTERNAL'));
    renderPanel();

    await fill(user, ['OldPassword123', 'NewPassword456', 'NewPassword456']);
    await user.click(submit());

    expect(await screen.findByText('We could not change your password. Please try again.')).toBeInTheDocument();
    expect(screen.queryByText('That is not your current password')).not.toBeInTheDocument();
    expect(auth.clearSession).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('clears the banner on the next keystroke', async () => {
    const user = userEvent.setup();
    mockedAuth.changePassword.mockRejectedValue(refusal(500, 'INTERNAL'));
    renderPanel();

    await fill(user, ['OldPassword123', 'NewPassword456', 'NewPassword456']);
    await user.click(submit());
    await screen.findByText('We could not change your password. Please try again.');

    await user.type(current(), '4');

    expect(screen.queryByText('We could not change your password. Please try again.')).not.toBeInTheDocument();
  });
});
