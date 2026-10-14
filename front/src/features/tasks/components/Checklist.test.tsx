import { useState } from 'react';
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

const addField = () => screen.getByRole('textbox', { name: 'Add an item' });

describe('Checklist, adding', () => {
  it('has no button that adds a row: items come from the field at the foot', () => {
    renderChecklist();

    expect(screen.queryByRole('button', { name: /add item/i })).not.toBeInTheDocument();
    expect(addField()).toHaveValue('');
  });

  it('adds the trimmed text as a new, unfinished item on Enter, and empties the field', async () => {
    const user = userEvent.setup();
    const { onChange } = renderChecklist();

    await user.type(addField(), '  Book the venue  {Enter}');

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as ChecklistItemData[];
    expect(next).toHaveLength(3);
    expect(next.slice(0, 2)).toEqual(ITEMS);
    expect(next[2]).toMatchObject({ text: 'Book the venue', completed: false });
    expect(next[2].id).toBeTruthy();
    expect(addField()).toHaveValue('');
  });

  it.each([['nothing', ''], ['spaces', '   ']])('adds nothing on Enter when the field holds %s', async (_label, typed) => {
    const user = userEvent.setup();
    const { onChange } = renderChecklist();

    if (typed) await user.type(addField(), typed);
    await user.type(addField(), '{Enter}');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('adds nothing until Enter is pressed', async () => {
    const user = userEvent.setup();
    const { onChange } = renderChecklist();

    await user.type(addField(), 'Almost there');

    expect(onChange).not.toHaveBeenCalled();
    expect(addField()).toHaveValue('Almost there');
  });

  it('does not submit the form it sits in when Enter adds an item', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(event => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Checklist items={[]} onChange={vi.fn()} />
      </form>,
    );

    await user.type(addField(), 'Pack the tent{Enter}');
    await user.type(addField(), '{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('gives every new item an id of its own, so two of them are not one row', async () => {
    const user = userEvent.setup();
    const { onChange } = renderChecklist([]);

    await user.type(addField(), 'One{Enter}Two{Enter}');

    const first = (onChange.mock.calls[0][0] as ChecklistItemData[])[0];
    const second = (onChange.mock.calls[1][0] as ChecklistItemData[]).at(-1) as ChecklistItemData;
    expect(second.id).not.toBe(first.id);
  });
});

describe('Checklist', () => {
  it('removes an item whose text was emptied once the field is left, and keeps one that still has text', async () => {
    const user = userEvent.setup();
    // The component is controlled, so a clear only reaches the field when the
    // caller stores what it reports.
    const Stateful = () => {
      const [items, setItems] = useState(ITEMS);
      return <Checklist items={items} onChange={setItems} />;
    };
    render(<Stateful />);

    await user.click(screen.getByRole('textbox', { name: 'Checklist item 1' }));
    await user.tab();
    expect(screen.getAllByRole('textbox', { name: /Checklist item/ })).toHaveLength(2);

    await user.clear(screen.getByRole('textbox', { name: 'Checklist item 2' }));
    await user.tab();

    expect(screen.getAllByRole('textbox', { name: /Checklist item/ })).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: 'Checklist item 1' })).toHaveValue('Write the migration');
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
