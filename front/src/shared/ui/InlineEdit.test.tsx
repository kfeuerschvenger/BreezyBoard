import { afterEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { InlineEdit } from './InlineEdit';
import { announce } from './liveAnnouncer';

const renderField = (props: Partial<React.ComponentProps<typeof InlineEdit>> = {}) => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onError = vi.fn();
  const view = render(<InlineEdit value="Backlog" label="Column name" onSave={onSave} onError={onError} {...props} />);
  return { ...view, onSave, onError };
};

const field = () => screen.getByRole('textbox', { name: 'Column name' });

describe('InlineEdit', () => {
  // The region lasts for the life of the page, so each test starts from a page without it.
  afterEach(() => document.querySelector('[role="status"]')?.remove());

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

  describe('after a refusal', () => {
    const refuse = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.clear(field());
      await user.type(field(), 'Done');
      await user.tab();
    };
    const validate = (next: string) => (next === 'Done' ? 'Taken.' : null);

    it('leaves focus where the person moved it, announces the reason and keeps it on the field until the next edit', async () => {
      const user = userEvent.setup();
      render(
        <>
          <InlineEdit value="Backlog" label="Column name" onSave={vi.fn()} validate={validate} />
          <button type="button">Elsewhere</button>
        </>
      );

      expect(field()).not.toHaveAttribute('aria-invalid');
      expect(field()).not.toHaveAttribute('aria-describedby');

      await user.clear(field());
      await user.type(field(), 'Done');
      await user.tab();
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus();
      expect(screen.getByRole('status')).toHaveTextContent('Taken.');
      expect(field()).toHaveValue('Backlog');
      expect(field()).toHaveAttribute('aria-invalid', 'true');
      expect(field()).toHaveAccessibleDescription('Taken.');

      await user.type(field(), '!');

      expect(field()).not.toHaveAttribute('aria-invalid');
      expect(field()).not.toHaveAttribute('aria-describedby');
    });

    it('leaves focus alone and announces the reason after a failed save', async () => {
      const user = userEvent.setup();
      render(
        <>
          <InlineEdit
            value="Backlog"
            label="Column name"
            onSave={vi.fn().mockRejectedValue(new Error('offline'))}
            failureMessage="Could not rename."
          />
          <button type="button">Elsewhere</button>
        </>
      );

      await user.clear(field());
      await user.type(field(), 'Inbox');
      await user.tab();

      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Could not rename.'));
      expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus();
      expect(field()).toHaveValue('Backlog');
      expect(field()).toHaveAccessibleDescription('Could not rename.');
    });

    it('drops the reason on Escape', async () => {
      const user = userEvent.setup();
      renderField({ validate });
      await refuse(user);

      await user.click(field());
      await user.keyboard('{Escape}');

      expect(field()).not.toHaveAttribute('aria-invalid');
      expect(field()).not.toHaveAttribute('aria-describedby');
    });

    it('drops the reason on a blur that changes nothing', async () => {
      const user = userEvent.setup();
      renderField({ validate });
      await refuse(user);

      await user.click(field());
      await user.tab();

      expect(field()).not.toHaveAttribute('aria-invalid');
      expect(field()).not.toHaveAttribute('aria-describedby');
    });

    it('drops the reason when the value changes from outside', async () => {
      const user = userEvent.setup();
      const { rerender, onSave } = renderField({ validate });
      await refuse(user);

      rerender(<InlineEdit value="Renamed elsewhere" label="Column name" onSave={onSave} validate={validate} />);

      expect(field()).not.toHaveAttribute('aria-invalid');
      expect(field()).not.toHaveAttribute('aria-describedby');
    });
  });

  it('shares one polite live region between every field on the page, and keeps it when they are gone', () => {
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

    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('still speaks a message said after the last field is gone', () => {
    const { unmount } = render(<InlineEdit value="One" label="First" onSave={vi.fn()} />);
    unmount();

    announce('Said late.');

    expect(screen.getByRole('status')).toHaveTextContent('Said late.');
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

  it('announces a successful save through a polite live region, and the reason for a refused one', async () => {
    const user = userEvent.setup();
    renderField({ validate: next => (next === 'Done' ? 'Taken.' : null), onError: undefined });
    const status = screen.getByRole('status');

    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toBeEmptyDOMElement();

    await user.clear(field());
    await user.type(field(), 'Done');
    await user.tab();
    expect(status).toHaveTextContent('Taken.');

    await user.clear(field());
    await user.type(field(), 'Inbox');
    await user.tab();

    await waitFor(() => expect(status).toHaveTextContent('Column name saved.'));

    await user.click(field());
    expect(status).toBeEmptyDOMElement();
  });

  it('leaves the shared live region silent on a refusal when onError says why', async () => {
    const user = userEvent.setup();
    const { onError } = renderField({ validate: next => (next === 'Done' ? 'Taken.' : null) });

    await user.clear(field());
    await user.type(field(), 'Done');
    await user.tab();

    expect(onError).toHaveBeenCalledWith('Taken.');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
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
