import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DndContext } from '@dnd-kit/core';
import Column from './Column';
import { BreezeContext } from '@/features/breeze/breezeContext';
import type { BreezeContextValue } from '@/features/breeze/breezeContext';
import type { Column as ColumnModel, Task } from '@/models';

const column: ColumnModel = {
  _id: 'col-todo',
  title: 'To Do',
  color: { _id: 'c1', value: '#3B82F6' },
  order: 0,
};

const makeTask = (id: string, title: string): Task => ({
  _id: id,
  title,
  description: '',
  status: column._id,
  priority: 'low',
  color: '#3B82F6',
  owner: '',
  boardId: 'board-1',
  checklist: [],
  order: 'a0',
});

type ColumnProps = Partial<React.ComponentProps<typeof Column>>;

const renderColumn = (tasks: Task[], props: ColumnProps = {}, breeze?: Partial<BreezeContextValue>) =>
  render(
    <BreezeContext.Provider
      value={{ stored: 'breezy', level: 'breezy', reducedBySystem: false, setLevel: () => undefined, ...breeze }}
    >
      <DndContext>
        <Column column={column} tasks={tasks} onTaskClick={vi.fn()} colorOf={() => '#3B82F6'} {...props} />
      </DndContext>
    </BreezeContext.Provider>,
  );

/** The cards and the gap in the order they stand in the column, by what they are. */
const layout = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-task-card], [data-drop-gap]')).map(element =>
    element.matches('[data-drop-gap]') ? 'gap' : (element.dataset.taskCard as string),
  );

const THREE = [makeTask('a', 'Alpha'), makeTask('b', 'Bravo'), makeTask('c', 'Charlie')];

describe('Column', () => {
  it('says "Still air" when it holds no tasks, and shows a zero count', () => {
    renderColumn([]);

    expect(screen.getByRole('heading', { name: 'To Do' })).toBeInTheDocument();
    expect(screen.getByText('Still air')).toBeInTheDocument();
    expect(screen.getByText('Drop a card here or add one below.')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('shows no empty hint once it holds a task', () => {
    renderColumn([makeTask('t1', 'Write the spec')]);

    expect(screen.getByText('Write the spec')).toBeInTheDocument();
    expect(screen.queryByText('Still air')).not.toBeInTheDocument();
  });

  it('opens a task when its title is pressed', async () => {
    const onTaskClick = vi.fn();
    renderColumn([makeTask('t1', 'Write the spec')], { onTaskClick });

    await userEvent.click(screen.getByText('Write the spec'));

    expect(onTaskClick).toHaveBeenCalledWith(expect.objectContaining({ _id: 't1' }));
  });

  // jsdom loads no stylesheet, so this only pins the class that does the work.
  // The behaviour itself, a header that stays put while the body scrolls, is
  // measured in a real browser by e2e/verify/board-layout.mjs.
  it('keeps the header out of the scrolling body', () => {
    renderColumn([makeTask('t1', 'Write the spec')]);

    const header = screen.getByRole('heading', { name: 'To Do' }).parentElement as HTMLElement;
    const body = screen.getByText('Write the spec').closest('.overflow-y-auto') as HTMLElement;

    expect(body).not.toBeNull();
    expect(body.contains(header)).toBe(false);
    expect(header).toHaveClass('shrink-0');
  });

  it('names its body, so the drag hook can read its cards off the screen', () => {
    renderColumn([makeTask('t1', 'Write the spec')]);

    const body = document.querySelector('[data-column-body="col-todo"]') as HTMLElement;
    expect(body).toContainElement(screen.getByText('Write the spec'));
  });

  // Counted from the cards the board holds, not from what is on screen, so a
  // card in the air does not make the column look emptier than it is.
  it('counts a card that is in the air', () => {
    renderColumn(THREE, { heldId: 'b' });

    expect(screen.getByText('3')).toBeInTheDocument();
  });
});

describe('Column, the last one', () => {
  it('is drawn as where work lands: the arrival icon in the header, a green dot', () => {
    renderColumn([], { isLast: true });

    const header = screen.getByRole('heading', { name: 'To Do' }).parentElement as HTMLElement;
    expect(header.querySelector('svg.text-green-deep')).not.toBeNull();
    expect(header.querySelector('span.bg-green-mid')).not.toBeNull();
  });

  it('keeps its own name', () => {
    renderColumn([], { isLast: true });

    expect(screen.getByRole('heading', { name: 'To Do' })).toBeInTheDocument();
    expect(screen.queryByText('Landed')).not.toBeInTheDocument();
  });

  it('marks every card in it as done', () => {
    renderColumn([makeTask('t1', 'Write the spec')], { isLast: true });

    expect(screen.getByRole('button', { name: 'Write the spec' })).toHaveClass('text-ink-secondary');
  });

  it('draws any other column with its own colour and no icon', () => {
    renderColumn([]);

    const header = screen.getByRole('heading', { name: 'To Do' }).parentElement as HTMLElement;
    expect(header.querySelector('svg')).toBeNull();
    expect(header.querySelector('span[aria-hidden="true"]')).toHaveStyle({ backgroundColor: '#3B82F6' });
  });
});

describe('Column, while a card is carried', () => {
  it('draws no gap when none is asked for', () => {
    renderColumn(THREE);

    expect(layout()).toEqual(['a', 'b', 'c']);
  });

  it('opens the gap before the card at the index', () => {
    renderColumn(THREE, { gapIndex: 1 });

    expect(layout()).toEqual(['a', 'gap', 'b', 'c']);
  });

  it('opens the gap at the end when the index is the count of cards', () => {
    renderColumn(THREE, { gapIndex: 3 });

    expect(layout()).toEqual(['a', 'b', 'c', 'gap']);
  });

  // The held card is mounted where it was but takes no room, so the index
  // counts the cards that do: with B in the air, index 1 is before C.
  it('does not count the held card among the places', () => {
    renderColumn(THREE, { heldId: 'b', gapIndex: 1 });

    expect(layout()).toEqual(['a', 'b', 'gap', 'c']);
  });

  it('keeps the held card in the document, collapsed', () => {
    renderColumn(THREE, { heldId: 'b' });

    const held = document.querySelector('[data-task-card="b"]') as HTMLElement;
    expect(held).toHaveClass('h-0');
    expect(document.querySelector('[data-task-card="a"]')).not.toHaveClass('h-0');
  });

  it('puts the gap in an empty column in place of the hint', () => {
    renderColumn([], { gapIndex: 0 });

    expect(layout()).toEqual(['gap']);
    expect(screen.queryByText('Still air')).not.toBeInTheDocument();
  });

  it('shows the hint again when the only card is carried somewhere else', () => {
    renderColumn([makeTask('a', 'Alpha')], { heldId: 'a', gapIndex: null });

    expect(screen.getByText('Still air')).toBeInTheDocument();
  });

  it('hides the gap from assistive technology, since it is not a thing', () => {
    renderColumn(THREE, { gapIndex: 0 });

    expect(document.querySelector('[data-drop-gap]')).toHaveAttribute('aria-hidden', 'true');
    expect(document.querySelector('[data-drop-gap]')?.textContent).toBe('');
  });

  it('lights the column that would take the card', () => {
    const { unmount } = renderColumn(THREE, { highlighted: true });
    const lit = document.querySelector('[data-column]') as HTMLElement;
    expect(lit).toHaveAttribute('data-highlighted');
    expect(lit).toHaveClass('bg-glass-strong');
    expect(lit).toHaveClass('border-sky-edge');
    unmount();

    renderColumn(THREE);
    const unlit = document.querySelector('[data-column]') as HTMLElement;
    expect(unlit).not.toHaveAttribute('data-highlighted');
    expect(unlit).toHaveClass('bg-glass-column');
  });
});

describe('Column, the empty hint', () => {
  const icon = () => screen.getByText('Still air').parentElement!.querySelector('svg') as SVGElement;

  it('sways its icon while there is wind', () => {
    renderColumn([]);

    expect(icon()).toHaveClass('animate-bb-sway-slow');
  });

  it('holds it still at Still, which is the setting\'s promise', () => {
    renderColumn([], {}, { level: 'still', stored: 'still' });

    expect(icon()).not.toHaveClass('animate-bb-sway-slow');
  });

  it('is hidden from assistive technology on the icon and read as text', () => {
    renderColumn([]);

    expect(icon()).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Column, the composer at its foot', () => {
  it('offers one that names the column when it can add a card', () => {
    renderColumn([], { onCreateTask: vi.fn() });

    expect(screen.getByRole('button', { name: 'Add a card to To Do' })).toBeInTheDocument();
  });

  it('offers none when it cannot', () => {
    renderColumn([]);

    expect(screen.queryByRole('button', { name: /add a card/i })).not.toBeInTheDocument();
  });

  it('keeps the composer outside the scrolling body, so it never scrolls away', () => {
    renderColumn(THREE, { onCreateTask: vi.fn() });

    const body = document.querySelector('[data-column-body]') as HTMLElement;
    expect(body.contains(screen.getByRole('button', { name: 'Add a card to To Do' }))).toBe(false);
  });
});
