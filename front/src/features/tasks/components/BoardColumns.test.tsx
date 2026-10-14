import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoardColumns } from './BoardColumns';
import type { Task } from '@/models';
import type { ColumnData } from '../hooks/useBoardData';
import type { UseTaskDragAndDropResult } from '../hooks/useTaskDragAndDrop';
import type { UseTaskMoverResult } from '../hooks/useTaskMover';

const columns: ColumnData[] = [
  { _id: 'col-a', id: 'col-a', title: 'Backlog', color: '#3B82F6', order: 0 },
  { _id: 'col-b', id: 'col-b', title: 'Doing', color: '#22C55E', order: 1 },
  { _id: 'col-c', id: 'col-c', title: 'Done', color: '#F97316', order: 2 },
];

const task: Task = {
  _id: 't1',
  title: 'Write the spec',
  description: '',
  status: 'col-b',
  priority: 'low',
  color: '#3B82F6',
  owner: '',
  boardId: 'board-1',
  checklist: [],
  order: 'a0',
};

// dnd-kit renders a live region of its own, so the status role alone is ambiguous.
const announcer = () => document.querySelector<HTMLElement>('[data-move-announcer]')!;

const makeMover = (overrides: Partial<UseTaskMoverResult> = {}): UseTaskMoverResult => ({
  move: vi.fn(),
  moveToColumn: vi.fn().mockResolvedValue('moved'),
  announcement: '',
  announcementId: 0,
  announce: vi.fn(),
  focusRequest: null,
  requestFocus: vi.fn(),
  ...overrides,
});

const makeDrag = (mover: UseTaskMoverResult = makeMover()) =>
  ({
    sensors: [],
    activeTask: null,
    onDragStart: () => {},
    onDragEnd: () => {},
    mover,
  }) as unknown as UseTaskDragAndDropResult;

const drag = makeDrag();

const renderColumns = (tasks: Task[], onRequestComposer = () => {}, dragProps: UseTaskDragAndDropResult = drag) =>
  render(
    <BoardColumns
      columns={columns}
      tasks={tasks}
      drag={dragProps}
      taskColors={new Map()}
      onTaskClick={() => {}}
      onCreateTask={async () => task}
      onRequestComposer={onRequestComposer}
    />,
  );

describe('BoardColumns', () => {
  it('lays every column out in one labelled region, in board order', () => {
    renderColumns([task]);

    const region = screen.getByRole('region', { name: 'Board columns' });
    const titles = within(region)
      .getAllByRole('heading', { level: 2 })
      .map(heading => heading.textContent);

    expect(titles).toEqual(['Backlog', 'Doing', 'Done']);
  });

  // The row scrolls sideways on a narrow screen, and an empty board has no
  // drag handle inside it to give the keyboard a way in.
  it('makes the scrolling row reachable from the keyboard even with no tasks', () => {
    renderColumns([]);

    expect(screen.getByRole('region', { name: 'Board columns' })).toHaveAttribute('tabindex', '0');
  });

  it('puts a task in the column its status names and says "Still air" in the others', () => {
    renderColumns([task]);

    expect(screen.getByText('Write the spec')).toBeInTheDocument();
    expect(screen.getAllByText('Still air')).toHaveLength(2);
  });

  it('keeps the existing message when the board has no columns', () => {
    render(
      <BoardColumns
        columns={[]}
        tasks={[]}
        drag={drag}
        taskColors={new Map()}
        onTaskClick={() => {}}
        onCreateTask={async () => task}
      onRequestComposer={() => {}}
      />,
    );

    expect(screen.getByText(/no columns available/i)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Board columns' })).not.toBeInTheDocument();
  });

  describe('the empty board banner', () => {
    it('shows only while the board has no task at all, with the columns still beneath it', () => {
      renderColumns([]);

      expect(screen.getByRole('heading', { name: /a fresh board/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add your first card' })).toBeInTheDocument();
      expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toContain('Backlog');
      expect(screen.getAllByText('Still air')).toHaveLength(3);
    });

    it('is gone once the board has a task', () => {
      renderColumns([task]);

      expect(screen.queryByRole('heading', { name: /a fresh board/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Add your first card' })).not.toBeInTheDocument();
    });

    it('asks for the first composer when its button is pressed', async () => {
      const onRequestComposer = vi.fn();
      renderColumns([], onRequestComposer);

      await userEvent.click(screen.getByRole('button', { name: 'Add your first card' }));

      expect(onRequestComposer).toHaveBeenCalledTimes(1);
    });
  });

  describe('the Move to menu', () => {
    it('names every column of the board and marks the one the card is in', async () => {
      renderColumns([task]);

      await userEvent.click(screen.getByRole('button', { name: 'Move Write the spec to another column' }));

      const menu = screen.getByRole('menu', { name: 'Move Write the spec to' });
      const items = within(menu).getAllByRole('menuitem');
      expect(items.map(item => item.textContent)).toEqual(['Backlog', 'DoingCurrent', 'Done']);
      expect(items[1]).toHaveAttribute('aria-disabled', 'true');
    });

    it('hands the chosen column to the shared move path', async () => {
      const moveToColumn = vi.fn().mockResolvedValue('moved');
      renderColumns([task], () => {}, makeDrag(makeMover({ moveToColumn })));

      await userEvent.click(screen.getByRole('button', { name: 'Move Write the spec to another column' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Done' }));

      expect(moveToColumn).toHaveBeenCalledWith(task, { id: 'col-c', title: 'Done' });
    });

    it('does not open the task drawer when the menu is used', async () => {
      const onTaskClick = vi.fn();
      render(
        <BoardColumns
          columns={columns}
          tasks={[task]}
          drag={drag}
          taskColors={new Map()}
          onTaskClick={onTaskClick}
          onCreateTask={async () => task}
      onRequestComposer={() => {}}
        />,
      );

      await userEvent.click(screen.getByRole('button', { name: 'Move Write the spec to another column' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Backlog' }));

      expect(onTaskClick).not.toHaveBeenCalled();
    });

    it('announces the result of a move in a live region that is always mounted', () => {
      const { rerender } = renderColumns([task]);
      const region = announcer();
      expect(region).toBeEmptyDOMElement();

      rerender(
        <BoardColumns
          columns={columns}
          tasks={[task]}
          drag={makeDrag(makeMover({ announcement: 'Moved Write the spec to Done.' }))}
          taskColors={new Map()}
          onTaskClick={() => {}}
          onCreateTask={async () => task}
      onRequestComposer={() => {}}
        />,
      );

      expect(announcer()).toBe(region);
      expect(region).toHaveTextContent('Moved Write the spec to Done.');
    });

    it('gives focus back to the moved card once it has been rendered again', async () => {
      const { rerender } = renderColumns([task]);
      expect(document.body).toHaveFocus();

      rerender(
        <BoardColumns
          columns={columns}
          tasks={[task]}
          drag={makeDrag(makeMover({ focusRequest: { taskId: 't1', target: 'move-trigger', nonce: 1 } }))}
          taskColors={new Map()}
          onTaskClick={() => {}}
          onCreateTask={async () => task}
      onRequestComposer={() => {}}
        />,
      );

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Move Write the spec to another column' })).toHaveFocus(),
      );
    });

    it('hands the drag context the instructions and announcements it is given', () => {
      render(
        <BoardColumns
          columns={columns}
          tasks={[task]}
          drag={
            {
              ...makeDrag(),
              accessibility: { screenReaderInstructions: { draggable: 'Custom drag instructions.' } },
            } as unknown as UseTaskDragAndDropResult
          }
          taskColors={new Map()}
          onTaskClick={() => {}}
          onCreateTask={async () => task}
      onRequestComposer={() => {}}
        />,
      );

      expect(screen.getByText('Custom drag instructions.')).toBeInTheDocument();
    });

    it('gives focus back to the drag handle when that is what was asked for', async () => {
      const { rerender } = renderColumns([task]);

      rerender(
        <BoardColumns
          columns={columns}
          tasks={[task]}
          drag={makeDrag(makeMover({ focusRequest: { taskId: 't1', target: 'drag-handle', nonce: 1 } }))}
          taskColors={new Map()}
          onTaskClick={() => {}}
          onCreateTask={async () => task}
      onRequestComposer={() => {}}
        />,
      );

      await waitFor(() => expect(screen.getByRole('button', { name: 'Drag handle' })).toHaveFocus());
    });
  });
});

describe('BoardColumns, a card in the air', () => {
  const other: Task = { ...task, _id: 't2', title: 'Plan the route', order: 'a1' };

  const dragWith = (extra: Record<string, unknown>) =>
    ({ ...makeDrag(), ...extra }) as unknown as UseTaskDragAndDropResult;

  const gapPlaces = () =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-column-body]')).map(body =>
      Array.from(body.querySelectorAll<HTMLElement>('[data-task-card], [data-drop-gap]')).map(element =>
        element.matches('[data-drop-gap]') ? 'gap' : (element.dataset.taskCard as string),
      ),
    );

  it('draws the gap in the column of the slot and lights that column and no other', () => {
    renderColumns([task, other], () => {}, dragWith({ slot: { columnId: 'col-c', index: 0 } }));

    expect(gapPlaces()).toEqual([[], ['t1', 't2'], ['gap']]);
    const lit = Array.from(document.querySelectorAll('[data-highlighted]')).map(column => column.querySelector('h2')?.textContent);
    expect(lit).toEqual(['Done']);
  });

  it('collapses the card that is held, wherever the gap is', () => {
    renderColumns([task, other], () => {}, dragWith({ activeTask: task, slot: { columnId: 'col-b', index: 0 } }));

    expect(document.querySelector('[data-task-card="t1"]')).toHaveClass('h-0');
    expect(document.querySelector('[data-task-card="t2"]')).not.toHaveClass('h-0');
  });

  it('lights no column and opens no gap when nothing is held', () => {
    renderColumns([task]);

    expect(document.querySelector('[data-drop-gap]')).toBeNull();
    expect(document.querySelector('[data-highlighted]')).toBeNull();
  });
});

describe('BoardColumns, landing', () => {
  const dragWith = (extra: Record<string, unknown>) =>
    ({ ...makeDrag(), ...extra }) as unknown as UseTaskDragAndDropResult;

  it('settles the card that was just dropped, and only that one', () => {
    const other: Task = { ...task, _id: 't2', title: 'Plan the route', order: 'a1' };
    renderColumns([task, other], () => {}, dragWith({ landedId: 't2' }));

    expect(document.querySelector('[data-task-card="t2"]')).toHaveClass('animate-bb-land');
    expect(document.querySelector('[data-task-card="t1"]')).not.toHaveClass('animate-bb-land');
  });

  it('tells the drag hook when the card has finished settling', () => {
    const onLandingEnd = vi.fn();
    renderColumns([task], () => {}, dragWith({ landedId: 't1', onLandingEnd }));

    act(() => {
      document.querySelector('[data-task-card="t1"]')!.dispatchEvent(new Event('animationend', { bubbles: true }));
    });

    expect(onLandingEnd).toHaveBeenCalledWith('t1');
  });
});

describe('BoardColumns, adding a card from a column', () => {
  const renderWith = (onCreateTask: (columnId: string, title: string) => Promise<Task>, composerRequest = 0) =>
    render(
      <BoardColumns
        columns={columns}
        tasks={[task]}
        drag={drag}
        taskColors={new Map()}
        onTaskClick={() => {}}
        onCreateTask={onCreateTask}
        composerRequest={composerRequest}
        onRequestComposer={() => {}}
      />,
    );

  it('gives every column its own composer', () => {
    renderWith(async () => task);

    expect(screen.getByRole('button', { name: 'Add a card to Backlog' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a card to Doing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a card to Done' })).toBeInTheDocument();
  });

  it('hands the column and the title to the page', async () => {
    const onCreateTask = vi.fn().mockResolvedValue({ ...task, _id: 'new' });
    renderWith(onCreateTask);

    await userEvent.click(screen.getByRole('button', { name: 'Add a card to Doing' }));
    await userEvent.type(screen.getByRole('textbox', { name: /new card in Doing/i }), 'Pack the stove{Enter}');

    expect(onCreateTask).toHaveBeenCalledWith('col-b', 'Pack the stove');
  });

  it('opens the first column composer, and only that one, when asked from outside', () => {
    renderWith(async () => task, 1);

    expect(screen.getByRole('textbox', { name: /new card in Backlog/i })).toHaveFocus();
    expect(screen.queryByRole('textbox', { name: /new card in Doing/i })).not.toBeInTheDocument();
  });

  it('plays the arrival of the card it was given back, until that card is done arriving', async () => {
    const created = { ...task, _id: 'new', title: 'Pack the stove' };
    const onCreateTask = vi.fn().mockResolvedValue(created);
    const { rerender } = renderWith(onCreateTask);

    await userEvent.click(screen.getByRole('button', { name: 'Add a card to Backlog' }));
    await userEvent.type(screen.getByRole('textbox'), 'Pack the stove{Enter}');
    await waitFor(() => expect(onCreateTask).toHaveBeenCalled());

    // The page writes the card into the cache, which is what puts it on screen.
    rerender(
      <BoardColumns
        columns={columns}
        tasks={[task, created]}
        drag={drag}
        taskColors={new Map()}
        onTaskClick={() => {}}
        onCreateTask={onCreateTask}
        onRequestComposer={() => {}}
      />,
    );

    await waitFor(() => expect(document.querySelector('[data-task-card="new"]')).toHaveClass('animate-bb-in'));

    act(() => {
      document.querySelector('[data-task-card="new"]')!.dispatchEvent(new Event('animationend', { bubbles: true }));
    });
    expect(document.querySelector('[data-task-card="new"]')).not.toHaveClass('animate-bb-in');
  });
});

describe('BoardColumns, the last column', () => {
  it('is the one with the highest order, whatever order the columns arrive in', () => {
    render(
      <BoardColumns
        columns={[columns[2], columns[0], columns[1]]}
        tasks={[]}
        drag={drag}
        taskColors={new Map()}
        onTaskClick={() => {}}
        onCreateTask={async () => task}
        onRequestComposer={() => {}}
      />,
    );

    const withIcon = Array.from(document.querySelectorAll('[data-column]')).filter(column =>
      column.querySelector('h2 ~ svg.text-green-deep'),
    );
    expect(withIcon.map(column => column.querySelector('h2')?.textContent)).toEqual(['Done']);
  });
});
