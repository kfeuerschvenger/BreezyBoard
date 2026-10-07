import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
  focusRequest: null,
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

const renderColumns = (tasks: Task[], onAddTask = () => {}, dragProps: UseTaskDragAndDropResult = drag) =>
  render(
    <BoardColumns
      columns={columns}
      tasks={tasks}
      drag={dragProps}
      taskColors={new Map()}
      onTaskClick={() => {}}
      onAddTask={onAddTask}
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

  it('puts a task in the column its status names and hints in the others', () => {
    renderColumns([task]);

    expect(screen.getByText('Write the spec')).toBeInTheDocument();
    expect(screen.getAllByText(/no tasks here yet/i)).toHaveLength(2);
  });

  it('keeps the existing message when the board has no columns', () => {
    render(
      <BoardColumns
        columns={[]}
        tasks={[]}
        drag={drag}
        taskColors={new Map()}
        onTaskClick={() => {}}
        onAddTask={() => {}}
      />,
    );

    expect(screen.getByText(/no columns available/i)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Board columns' })).not.toBeInTheDocument();
  });

  describe('the empty board banner', () => {
    it('shows only while the board has no task at all, with the columns still beneath it', () => {
      renderColumns([]);

      expect(screen.getByRole('heading', { name: /no tasks yet/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add task' })).toBeInTheDocument();
      expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toContain('Backlog');
      expect(screen.getAllByText(/no tasks here yet/i)).toHaveLength(3);
    });

    it('is gone once the board has a task', () => {
      renderColumns([task]);

      expect(screen.queryByRole('heading', { name: /no tasks yet/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Add task' })).not.toBeInTheDocument();
    });

    it('starts a new task when its button is pressed', async () => {
      const onAddTask = vi.fn();
      renderColumns([], onAddTask);

      await userEvent.click(screen.getByRole('button', { name: 'Add task' }));

      expect(onAddTask).toHaveBeenCalledTimes(1);
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
          onAddTask={() => {}}
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
          onAddTask={() => {}}
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
          drag={makeDrag(makeMover({ focusRequest: { taskId: 't1', nonce: 1 } }))}
          taskColors={new Map()}
          onTaskClick={() => {}}
          onAddTask={() => {}}
        />,
      );

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Move Write the spec to another column' })).toHaveFocus(),
      );
    });
  });
});
