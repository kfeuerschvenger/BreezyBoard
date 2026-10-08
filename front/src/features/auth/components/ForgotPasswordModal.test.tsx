import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { useState } from 'react';
import { ForgotPasswordModal } from './ForgotPasswordModal';

const onSubmit = vi.fn();

// A real parent, so closing and reopening goes through the same props a page
// would pass instead of a prop the test flips by hand.
const Harness = () => {
  const [open, setOpen] = useState(true);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Reopen
      </button>
      <ForgotPasswordModal open={open} onClose={() => setOpen(false)} onSubmit={onSubmit} />
    </>
  );
};

const dialog = () => screen.getByRole('dialog', { name: 'Forgot password' });
const emailField = () => within(dialog()).getByLabelText('Email address');
const send = () => within(dialog()).getByRole('button', { name: 'Send reset link' });

const refusedWith = (status: number) =>
  new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: {} as never,
    data: {},
  });

beforeEach(() => {
  onSubmit.mockReset().mockResolvedValue(undefined);
});

describe('ForgotPasswordModal', () => {
  it('asks for an email address instead of sending an empty request', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(send());

    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuses something that is not an email, in its own words', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(emailField(), 'not-an-email');
    await user.click(send());

    expect(await screen.findByText('Email is invalid')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sends the address and confirms with a conditional that names it', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(emailField(), 'ada@example.com');
    await user.click(send());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('ada@example.com'));
    const confirmation = await screen.findByRole('status');
    expect(confirmation).toHaveTextContent('If an account exists for ada@example.com, we have sent a link to reset its password.');
    expect(confirmation).not.toHaveTextContent(/no account|not found|does not exist/i);
    expect(within(dialog()).queryByLabelText('Email address')).not.toBeInTheDocument();
  });

  it('moves focus to the Done button when the form is replaced by the confirmation', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(emailField(), 'ada@example.com');
    await user.click(send());

    const close = await within(dialog()).findByRole('button', { name: 'Done' });
    await waitFor(() => expect(close).toHaveFocus());
  });

  it('says it is working while the request is out, and refuses a second press', async () => {
    const user = userEvent.setup();
    onSubmit.mockReturnValue(new Promise(() => {}));
    render(<Harness />);

    await user.type(emailField(), 'ada@example.com');
    await user.click(send());

    const busy = await within(dialog()).findByRole('button', { name: 'Sending...' });
    expect(busy).toBeDisabled();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('keeps the form and what was typed when the request fails', async () => {
    const user = userEvent.setup();
    onSubmit.mockRejectedValue(new Error('network'));
    render(<Harness />);

    await user.type(emailField(), 'ada@example.com');
    await user.click(send());

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not send the request. Please try again.');
    expect(emailField()).toHaveValue('ada@example.com');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('tells a rate limited caller to wait, not to try again at once', async () => {
    const user = userEvent.setup();
    onSubmit.mockRejectedValue(refusedWith(429));
    render(<Harness />);

    await user.type(emailField(), 'ada@example.com');
    await user.click(send());

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests. Please wait a few minutes before trying again.');
  });

  it('starts from an empty form when it is opened again after a confirmation', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(emailField(), 'ada@example.com');
    await user.click(send());
    await user.click(await within(dialog()).findByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Reopen' }));

    expect(await within(await screen.findByRole('dialog')).findByLabelText('Email address')).toHaveValue('');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
