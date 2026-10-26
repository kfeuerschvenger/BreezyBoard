import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it.each([
    ['isComposing is set', { isComposing: true }],
    ['the key code is 229', { keyCode: 229 }],
  ])('ignores Enter and Escape that belong to an input method editor when %s', async (_label, composing) => {
    const user = userEvent.setup();
    const { onSave } = renderField();

    await user.clear(field());
    await user.type(field(), 'Inbox');
    fireEvent.keyDown(field(), { key: 'Enter', ...composing });
    fireEvent.keyDown(field(), { key: 'Escape', ...composing });

    expect(field()).toHaveFocus();
    expect(field()).toHaveValue('Inbox');
    expect(onSave).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');

    expect(onSave).toHaveBeenCalledExactlyOnceWith('Inbox');
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

  it('returns focus to the field after a refusal and keeps the reason on it until the next edit', async () => {
    const user = userEvent.setup();
    renderField({ validate: next => (next === 'Done' ? 'Taken.' : null) });

    expect(field()).not.toHaveAttribute('aria-invalid');
    expect(field()).not.toHaveAttribute('aria-describedby');

    await user.clear(field());
    await user.type(field(), 'Done');
    await user.tab();

    await waitFor(() => expect(field()).toHaveFocus());
    expect(field()).toHaveValue('Backlog');
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(field()).toHaveAccessibleDescription('Taken.');

    await user.type(field(), '!');

    expect(field()).not.toHaveAttribute('aria-invalid');
    expect(field()).not.toHaveAttribute('aria-describedby');
  });

  it('returns focus to the field after a failed save and keeps the reason on it', async () => {
    const user = userEvent.setup();
    renderField({ onSave: vi.fn().mockRejectedValue(new Error('offline')), failureMessage: 'Could not rename.' });

    await user.clear(field());
    await user.type(field(), 'Inbox');
    await user.tab();

    await waitFor(() => expect(field()).toHaveFocus());
    expect(field()).toHaveValue('Backlog');
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(field()).toHaveAccessibleDescription('Could not rename.');
  });

  it('shares one polite live region between every field on the page, and removes it with the last one', () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(
      <>
        <InlineEdit value="One" label="First" onSave={save} />
        <InlineEdit value="Two" label="Second" onSave={save} />
        <InlineEdit value="Three" label="Third" onSave={save} />
      </>
    );

    expect(screen.getAllByRole('status')).toHaveLength(1);

    unmount();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
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

  it('shows a pencil beside the text without a hover, hidden from assistive technology', () => {
    renderField();

    const pencil = field().parentElement?.querySelector('svg');

    expect(pencil).toBeInTheDocument();
    expect(pencil).toHaveAttribute('aria-hidden', 'true');
    expect(pencil).not.toHaveClass('hidden');
  });

  it('announces a successful save through a polite live region, and nothing for a refused one', async () => {
    const user = userEvent.setup();
    renderField({ validate: next => (next === 'Done' ? 'Taken.' : null) });
    const status = screen.getByRole('status');

    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toBeEmptyDOMElement();

    await user.clear(field());
    await user.type(field(), 'Done');
    await user.tab();
    expect(status).toBeEmptyDOMElement();

    await user.clear(field());
    await user.type(field(), 'Inbox');
    await user.tab();

    await waitFor(() => expect(status).toHaveTextContent('Column name saved.'));

    await user.click(field());
    expect(status).toBeEmptyDOMElement();
  });

  it('keeps its live region out of the heading it sits in, so the heading keeps its name', async () => {
    const user = userEvent.setup();
    render(
      <h2>
        <InlineEdit value="Backlog" label="Column name" onSave={vi.fn().mockResolvedValue(undefined)} />
      </h2>
    );

    await user.clear(field());
    await user.type(field(), 'Inbox');
    await user.tab();

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Column name saved.'));
    expect(screen.getByRole('heading')).not.toHaveTextContent('saved');
  });

  describe('wrapping', () => {
    const LONG = 'A board with a name so long that it cannot fit on one line of the header of its page';

    it('shows a long text in full in a field that wraps, and saves it on Enter', async () => {
      const user = userEvent.setup();
      const { onSave } = renderField({ wrap: true, value: LONG });

      expect(field().tagName).toBe('TEXTAREA');
      expect(field()).toHaveValue(LONG);
      expect(field()).not.toHaveClass('truncate');

      await user.type(field(), '!{Enter}');

      expect(onSave).toHaveBeenCalledExactlyOnceWith(`${LONG}!`);
    });

    it('keeps one line, cut short with an ellipsis, when it does not wrap', () => {
      renderField({ value: LONG });

      expect(field().tagName).toBe('INPUT');
      expect(field()).toHaveClass('truncate');
    });

    it('turns a pasted line break into a space', async () => {
      const user = userEvent.setup();
      const { onSave } = renderField({ wrap: true });

      await user.clear(field());
      await user.click(field());
      await user.paste('First\nSecond');
      await user.tab();

      expect(onSave).toHaveBeenCalledExactlyOnceWith('First Second');
    });
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
