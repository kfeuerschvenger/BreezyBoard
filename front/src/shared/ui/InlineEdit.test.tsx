import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { InlineEdit } from './InlineEdit';

const renderField = (props: Partial<React.ComponentProps<typeof InlineEdit>> = {}) => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onError = vi.fn();
  const view = render(<InlineEdit value="Backlog" label="Column name" onSave={onSave} onError={onError} {...props} />);
  return { ...view, onSave, onError };
};

const field = () => screen.getByRole('textbox', { name: 'Column name' });

describe('InlineEdit', () => {
  it('shows the saved text in a named field', () => {
    renderField();

    expect(field()).toHaveValue('Backlog');
  });

  it('saves the trimmed text when it loses focus', async () => {
    const user = userEvent.setup();
    const { onSave } = renderField();

    await user.clear(field());
    await user.type(field(), '  Inbox  ');
    await user.tab();

    expect(onSave).toHaveBeenCalledExactlyOnceWith('Inbox');
  });

  it('saves on Enter, which leaves the field', async () => {
    const user = userEvent.setup();
    const { onSave } = renderField();

    await user.clear(field());
    await user.type(field(), 'Inbox{Enter}');

    expect(onSave).toHaveBeenCalledExactlyOnceWith('Inbox');
    expect(field()).not.toHaveFocus();
  });

  it('puts the saved text back on Escape and saves nothing', async () => {
    const user = userEvent.setup();
    const { onSave } = renderField();

    await user.clear(field());
    await user.type(field(), 'Inbox{Escape}');

    expect(field()).toHaveValue('Backlog');
    expect(field()).not.toHaveFocus();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves nothing when the text did not change, even with spaces added around it', async () => {
    const user = userEvent.setup();
    const { onSave } = renderField();

    await user.type(field(), '   ');
    await user.tab();

    expect(onSave).not.toHaveBeenCalled();
    expect(field()).toHaveValue('Backlog');
  });

  it('refuses an empty text, puts the saved one back and says why', async () => {
    const user = userEvent.setup();
    const { onSave, onError } = renderField({ emptyMessage: 'A column needs a name.' });

    await user.clear(field());
    await user.tab();

    expect(onSave).not.toHaveBeenCalled();
    expect(field()).toHaveValue('Backlog');
    expect(onError).toHaveBeenCalledWith('A column needs a name.');
  });

  it('refuses a text the validator rejects', async () => {
    const user = userEvent.setup();
    const { onSave, onError } = renderField({ validate: next => (next === 'Done' ? 'Taken.' : null) });

    await user.clear(field());
    await user.type(field(), 'Done');
    await user.tab();

    expect(onSave).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('Taken.');
    expect(field()).toHaveValue('Backlog');
  });

  it('goes back to the saved text and reports a save that failed', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error('offline'));
    const { onError } = renderField({ onSave, failureMessage: 'Could not rename.' });

    await user.clear(field());
    await user.type(field(), 'Inbox');
    await user.tab();

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Could not rename.'));
    expect(field()).toHaveValue('Backlog');
  });

  it('is read only while the save is in flight, so one blur cannot send the text twice', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => undefined;
    const onSave = vi.fn().mockReturnValue(new Promise<void>(resolve => (finish = resolve)));
    renderField({ onSave });

    await user.clear(field());
    await user.type(field(), 'Inbox');
    await user.tab();

    expect(field()).toHaveAttribute('readonly');
    expect(field()).toHaveAttribute('aria-busy', 'true');
    finish();
    await waitFor(() => expect(field()).not.toHaveAttribute('readonly'));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('follows the value while it is not being edited', () => {
    const { rerender, onSave } = renderField();

    rerender(<InlineEdit value="Renamed elsewhere" label="Column name" onSave={onSave} />);

    expect(field()).toHaveValue('Renamed elsewhere');
  });

  it('keeps what is being typed when the value changes under it', async () => {
    const user = userEvent.setup();
    const { rerender, onSave } = renderField();

    await user.type(field(), '!');
    rerender(<InlineEdit value="Renamed elsewhere" label="Column name" onSave={onSave} />);

    expect(field()).toHaveValue('Backlog!');
  });

  it('limits the length of what can be typed', () => {
    renderField({ maxLength: 40 });

    expect(field()).toHaveAttribute('maxlength', '40');
  });

  it('has no accessibility violations inside a heading', async () => {
    const { container } = render(
      <h2>
        <InlineEdit value="Backlog" label="Column name" onSave={vi.fn()} />
      </h2>
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
