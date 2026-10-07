import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoardColumns } from './BoardColumns';
import type { Task } from '@/models';
import type { ColumnData } from '../hooks/useBoardData';
import type { UseTaskDragAndDropResult } from '../hooks/useTaskDragAndDrop';

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

const drag = {
  sensors: [],
  activeTask: null,
  onDragStart: () => {},
  onDragEnd: () => {},
} as unknown as UseTaskDragAndDropResult;

const renderColumns = (tasks: Task[], onAddTask = () => {}) =>
  render(
    <BoardColumns
      columns={columns}
      tasks={tasks}
      drag={drag}
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
});
