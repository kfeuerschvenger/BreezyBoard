import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResetPasswordForm } from './ResetPasswordForm';

const onSubmit = vi.fn();
const onDirty = vi.fn();

const renderForm = (error: string | null = null) => render(<ResetPasswordForm onSubmit={onSubmit} error={error} onDirty={onDirty} />);

const newPassword = () => screen.getByLabelText('New password');
const confirmation = () => screen.getByLabelText('Confirm new password');
const submit = () => screen.getByRole('button', { name: 'Set new password' });

const fill = async (user: ReturnType<typeof userEvent.setup>, password: string, confirm = password) => {
  await user.type(newPassword(), password);
  await user.type(confirmation(), confirm);
  await user.click(submit());
};

beforeEach(() => {
  onSubmit.mockReset().mockResolvedValue(undefined);
  onDirty.mockReset();
});

describe('ResetPasswordForm validation', () => {
  it('asks for both fields instead of submitting an empty form', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(submit());

    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(screen.getByText('Please confirm your password')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each([
    ['Pass1', 'Password must be at least 8 characters'],
    ['Passw0r', 'Password must be at least 8 characters'],
    ['PASSWORD123', 'Password must contain a lowercase letter'],
    ['password123', 'Password must contain an uppercase letter'],
    ['PasswordOnly', 'Password must contain a number'],
  ])('refuses %s with the registration rule', async (password, message) => {
    const user = userEvent.setup();
    renderForm();

    await fill(user, password);

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuses a confirmation that does not match', async () => {
    const user = userEvent.setup();
    renderForm();

    await fill(user, 'Password123', 'Password124');

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('describes the rule next to the field, and ties that text to the field', () => {
    renderForm();

    const hint = screen.getByText(/At least 8 characters, with a lowercase letter/);

    expect(newPassword()).toHaveAttribute('aria-describedby', hint.id);
  });
});

describe('ResetPasswordForm submitting', () => {
  it('sends the new password and nothing else', async () => {
    const user = userEvent.setup();
    renderForm();

    await fill(user, 'Password123');

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Password123'));
  });

  it('has a separate reveal control for each field, each with its own name', () => {
    renderForm();

    expect(screen.getByRole('button', { name: 'Show new password' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show confirm new password' })).toBeInTheDocument();
  });

  it('marks both fields as new passwords so a password manager offers to save one', () => {
    renderForm();

    expect(newPassword()).toHaveAttribute('autocomplete', 'new-password');
    expect(confirmation()).toHaveAttribute('autocomplete', 'new-password');
  });

  it('says it is working while the request is out, and refuses a second press', async () => {
    const user = userEvent.setup();
    onSubmit.mockReturnValue(new Promise(() => {}));
    renderForm();

    await fill(user, 'Password123');

    const busy = await screen.findByRole('button', { name: 'Saving...' });
    expect(busy).toBeDisabled();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('shows a failure above the fields as an alert, and reports the first keystroke after it', async () => {
    const user = userEvent.setup();
    renderForm('We could not reset your password. Please try again.');

    expect(screen.getByRole('alert')).toHaveTextContent('We could not reset your password. Please try again.');

    await user.type(newPassword(), 'a');

    expect(onDirty).toHaveBeenCalled();
  });
});
