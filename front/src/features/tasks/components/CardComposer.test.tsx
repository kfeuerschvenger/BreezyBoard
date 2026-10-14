import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardComposer } from './CardComposer';

const renderComposer = (onSubmit = vi.fn().mockResolvedValue(undefined), openRequest = 0) =>
  render(<CardComposer columnId="col-1" columnTitle="Backlog" onSubmit={onSubmit} openRequest={openRequest} />);

const openIt = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Add a card to Backlog' }));
  return screen.getByRole('textbox', { name: 'Title of the new card in Backlog' });
};

beforeEach(() => {
  window.localStorage.clear();
});

describe('CardComposer closed', () => {
  it('is a button that names its column', () => {
    renderComposer();

    expect(screen.getByRole('button', { name: 'Add a card to Backlog' })).toHaveTextContent('Add a card');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('opens to a field that has focus', async () => {
    renderComposer();

    const field = await openIt();

    expect(field).toHaveFocus();
  });
});

describe('CardComposer adding a card', () => {
  it('adds the trimmed title on Enter, clears the field and stays open for the next one', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderComposer(onSubmit);
    const field = await openIt();

    await userEvent.type(field, '  Pack the stove  {Enter}');

    expect(onSubmit).toHaveBeenCalledWith('Pack the stove');
    await waitFor(() => expect(field).toHaveValue(''));
    expect(field).toHaveFocus();
  });

  it('adds a second card without being opened again', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderComposer(onSubmit);
    const field = await openIt();

    await userEvent.type(field, 'One{Enter}');
    await waitFor(() => expect(field).toHaveValue(''));
    await userEvent.type(field, 'Two{Enter}');

    expect(onSubmit.mock.calls.map(call => call[0])).toEqual(['One', 'Two']);
  });

  it('adds with the Add button as well', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderComposer(onSubmit);
    await userEvent.type(await openIt(), 'Buy maps');

    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(onSubmit).toHaveBeenCalledWith('Buy maps');
  });

  it('starts a new line on Shift and Enter instead of adding', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderComposer(onSubmit);
    const field = await openIt();

    await userEvent.type(field, 'First{Shift>}{Enter}{/Shift}Second');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(field).toHaveValue('First\nSecond');
  });

  it('adds nothing for a title that is only spaces, and will not press Add for one', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderComposer(onSubmit);
    const field = await openIt();

    await userEvent.type(field, '   {Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('adds once however many times Enter is pressed while it is saving', async () => {
    let finish: () => void = () => {};
    const onSubmit = vi.fn(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        }),
    );
    renderComposer(onSubmit);
    const field = await openIt();

    await userEvent.type(field, 'Once{Enter}{Enter}{Enter}');
    finish();

    await waitFor(() => expect(field).toHaveValue(''));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('says what was added, in a live region that is mounted before the message', async () => {
    renderComposer();
    const field = await openIt();
    const region = screen.getByRole('status');
    expect(region).toBeEmptyDOMElement();

    await userEvent.type(field, 'Pack the stove{Enter}');

    await waitFor(() => expect(region).toHaveTextContent('Added Pack the stove to Backlog.'));
  });
});

describe('CardComposer when the card cannot be saved', () => {
  it('keeps what was typed, says so, and lets the person try again', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    renderComposer(onSubmit);
    const field = await openIt();

    await userEvent.type(field, 'Pack the stove{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('The card could not be added');
    expect(field).toHaveValue('Pack the stove');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(/could not be added/);

    await userEvent.type(field, '{Enter}');
    await waitFor(() => expect(field).toHaveValue(''));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('takes the message away as soon as the person types again', async () => {
    renderComposer(vi.fn().mockRejectedValue(new Error('offline')));
    const field = await openIt();
    await userEvent.type(field, 'A{Enter}');
    await screen.findByRole('alert');

    await userEvent.type(field, 'b');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('CardComposer closing', () => {
  it('closes on Escape and gives focus back to the button that opened it', async () => {
    renderComposer();
    const field = await openIt();

    await userEvent.type(field, '{Escape}');

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a card to Backlog' })).toHaveFocus();
  });

  it('closes with Done', async () => {
    renderComposer();
    await openIt();

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

describe('CardComposer draft', () => {
  // A session that ends while somebody is typing must not take the sentence
  // with it, which is the reason every form here keeps one.
  it('keeps what was typed for the next time it is opened', async () => {
    const { unmount } = renderComposer();
    const field = await openIt();
    await userEvent.type(field, 'Half a thought');
    await waitFor(() => expect(window.localStorage.getItem('breezyboard:draft:composer:col-1')).toContain('Half a thought'));
    unmount();

    renderComposer();
    expect(await openIt()).toHaveValue('Half a thought');
  });

  it('forgets it once the card has been added', async () => {
    renderComposer();
    const field = await openIt();

    await userEvent.type(field, 'Done thinking{Enter}');
    await waitFor(() => expect(field).toHaveValue(''));

    expect(window.localStorage.getItem('breezyboard:draft:composer:col-1')).toBeNull();
  });

  it('keeps a draft per column', async () => {
    const { unmount } = render(<CardComposer columnId="col-1" columnTitle="Backlog" onSubmit={vi.fn()} />);
    await userEvent.type(await openIt(), 'Backlog thought');
    await waitFor(() => expect(window.localStorage.getItem('breezyboard:draft:composer:col-1')).not.toBeNull());
    unmount();

    render(<CardComposer columnId="col-2" columnTitle="Doing" onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add a card to Doing' }));

    expect(screen.getByRole('textbox', { name: 'Title of the new card in Doing' })).toHaveValue('');
  });
});

describe('CardComposer asked to open from outside', () => {
  it('opens and takes focus when the request number changes', () => {
    const { rerender } = renderComposer(vi.fn(), 0);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    rerender(<CardComposer columnId="col-1" columnTitle="Backlog" onSubmit={vi.fn()} openRequest={1} />);

    expect(screen.getByRole('textbox', { name: 'Title of the new card in Backlog' })).toHaveFocus();
  });

  it('focuses the field again when asked a second time while it is open', async () => {
    const { rerender } = renderComposer(vi.fn(), 1);
    const field = screen.getByRole('textbox');
    await userEvent.click(document.body);
    expect(field).not.toHaveFocus();

    rerender(<CardComposer columnId="col-1" columnTitle="Backlog" onSubmit={vi.fn()} openRequest={2} />);

    expect(field).toHaveFocus();
  });

  it('does not open for a request number it has already answered', async () => {
    const { rerender } = renderComposer(vi.fn(), 1);
    await userEvent.type(screen.getByRole('textbox'), '{Escape}');

    rerender(<CardComposer columnId="col-1" columnTitle="Backlog" onSubmit={vi.fn()} openRequest={1} />);

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
