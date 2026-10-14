import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checklist, type ChecklistItemData } from './Checklist';

// The checklist had no coverage of its own while it lived inside the task
// modal, because reaching it meant driving the whole modal. Standing on its
// own is what makes these four edits reachable, and they are the reason the
// component was worth lifting out.
//
// Every assertion is on what the component reports back, not on what it
// renders afterwards: it is controlled, so the list it is handed next is the
// caller's decision and not this component's behaviour.

const ITEMS: ChecklistItemData[] = [
  { id: 'item-1', text: 'Write the migration', completed: false },
  { id: 'item-2', text: 'Check the indexes', completed: true },
];

const renderChecklist = (items: ChecklistItemData[] = ITEMS) => {
  const onChange = vi.fn();
  render(<Checklist items={items} onChange={onChange} />);
  return { onChange };
};

describe('Checklist', () => {
  it('appends an empty item that is ready to be typed into', async () => {
    const user = userEvent.setup();
    const { onChange } = renderChecklist();

    await user.click(screen.getByRole('button', { name: /add item/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as ChecklistItemData[];
    expect(next).toHaveLength(3);
    expect(next.slice(0, 2)).toEqual(ITEMS);
    expect(next[2]).toMatchObject({ text: '', completed: false });
    expect(next[2].id).toBeTruthy();
  });

  it('gives every new item an id of its own, so two of them are not one row', async () => {
    const user = userEvent.setup();
    const { onChange } = renderChecklist([]);

    await user.click(screen.getByRole('button', { name: /add item/i }));
    const first = (onChange.mock.calls[0][0] as ChecklistItemData[])[0];

    render(<Checklist items={[first]} onChange={onChange} />);
    await user.click(screen.getAllByRole('button', { name: /add item/i })[1]);
    const second = (onChange.mock.calls[1][0] as ChecklistItemData[])[1];

    expect(second.id).not.toBe(first.id);
  });

  it('reports the edited text against the item that was edited', async () => {
    const user = userEvent.setup();
    const { onChange } = renderChecklist();

    await user.type(screen.getByDisplayValue('Check the indexes'), '!');

    const next = onChange.mock.calls.at(-1)?.[0] as ChecklistItemData[];
    expect(next.find(item => item.id === 'item-2')?.text).toBe('Check the indexes!');
    expect(next.find(item => item.id === 'item-1')?.text).toBe('Write the migration');
  });

  it('toggles completion without disturbing the text', async () => {
    const user = userEvent.setup();
    const { onChange } = renderChecklist();

    await user.click(screen.getAllByRole('checkbox')[0]);

    const next = onChange.mock.calls[0][0] as ChecklistItemData[];
    expect(next[0]).toEqual({ id: 'item-1', text: 'Write the migration', completed: true });
    expect(next[1]).toEqual(ITEMS[1]);
  });

  it('removes only the item whose delete control was used', async () => {
    const user = userEvent.setup();
    const { onChange } = renderChecklist();

    await user.click(screen.getAllByRole('button', { name: /delete checklist item/i })[1]);

    expect(onChange).toHaveBeenCalledWith([ITEMS[0]]);
  });

  it('names every delete control, so the row is operable without sight', () => {
    renderChecklist();

    expect(screen.getAllByRole('button', { name: /delete checklist item/i })).toHaveLength(ITEMS.length);
  });

  it('shows how far along it is as a named progress bar, and none for an empty list', () => {
    const { unmount } = render(<Checklist items={ITEMS} onChange={vi.fn()} />);

    const bar = screen.getByRole('progressbar', { name: 'Checklist progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '1');
    expect(bar).toHaveAttribute('aria-valuemax', '2');
    expect(bar).toHaveAttribute('aria-valuetext', '1 of 2 done');
    unmount();

    render(<Checklist items={[]} onChange={vi.fn()} />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('gives each row a text field named by its position, so the fields tell apart', () => {
    renderChecklist();

    expect(screen.getByRole('textbox', { name: 'Checklist item 1' })).toHaveValue('Write the migration');
    expect(screen.getByRole('textbox', { name: 'Checklist item 2' })).toHaveValue('Check the indexes');
  });

  it('names the other two controls of a row as well', () => {
    renderChecklist();

    expect(screen.getAllByRole('checkbox', { name: 'Completed' })).toHaveLength(ITEMS.length);
    expect(screen.getAllByRole('button', { name: 'Reorder checklist item' })).toHaveLength(ITEMS.length);
  });
});
