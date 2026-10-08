import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { ConfirmDialog } from './ConfirmDialog';

const renderDialog = (props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const view = render(
    <ConfirmDialog
      open
      title="Delete this board?"
      description={<p>Launch Plan will be deleted.</p>}
      confirmLabel="Delete board"
      destructive
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />
  );
  return { ...view, onConfirm, onCancel };
};

describe('ConfirmDialog', () => {
  it('is a named dialog that says what is about to happen', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Delete this board?' });
    expect(dialog).toHaveTextContent('Launch Plan will be deleted.');
  });

  it('puts focus on Cancel, the safe answer, not on the confirm button', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('confirms and cancels through their own buttons only', async () => {
    const { onConfirm, onCancel } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Delete board' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cancels on Escape', async () => {
    const { onCancel, onConfirm } = renderDialog();

    await userEvent.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('cannot be dismissed, or confirmed twice, while the confirmed action is running', async () => {
    const { onCancel, onConfirm } = renderDialog({ isWorking: true });

    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete board' }));

    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('renders nothing while closed', () => {
    renderDialog({ open: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    renderDialog();

    expect(await axe(document.body)).toHaveNoViolations();
  });
});
