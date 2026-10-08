import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskService } from '@/services';
import type { Task } from '@/models';
import { BoardColumns } from './BoardColumns';
import type { ColumnData } from '../hooks/useBoardData';
import { useTaskMover } from '../hooks/useTaskMover';
import type { UseTaskDragAndDropResult } from '../hooks/useTaskDragAndDrop';

vi.mock('@/services', () => ({
  TaskService: { move: vi.fn() },
}));

const mockedTaskService = vi.mocked(TaskService);

const columns: ColumnData[] = [
  { _id: 'col-a', id: 'col-a', title: 'Backlog', color: '#3B82F6', order: 0 },
  { _id: 'col-b', id: 'col-b', title: 'Done', color: '#22C55E', order: 1 },
];

const task: Task = {
  _id: 't1',
  title: 'Write the spec',
  description: '',
  status: 'col-a',
  priority: 'low',
  color: '#3B82F6',
  owner: '',
  boardId: 'board-1',
  checklist: [],
  order: 'a0',
};

const cache = {
  write: vi.fn(),
  replace: vi.fn(),
  refetch: vi.fn().mockResolvedValue(undefined),
};

// The real mover, so what the page announces is what the hook produces and
// BoardColumns renders, not a string handed in by the test.
const Board = () => {
  const mover = useTaskMover({ tasks: [task], cache });
  const drag = {
    sensors: [],
    activeTask: null,
    onDragStart: () => {},
    onDragEnd: () => {},
    mover,
  } as unknown as UseTaskDragAndDropResult;

  return (
    <BoardColumns
      columns={columns}
      tasks={[task]}
      drag={drag}
      taskColors={new Map()}
      onTaskClick={() => {}}
      onAddTask={() => {}}
    />
  );
};

const announcer = () => document.querySelector<HTMLElement>('[data-move-announcer]')!;

const moveToDone = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Move Write the spec to another column' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Done' }));
};

beforeEach(() => {
  mockedTaskService.move.mockReset().mockRejectedValue(new Error('refused'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('the move announcer', () => {
  it('announces a failed move, and announces the same failure again when it repeats', async () => {
    render(<Board />);
    // A screen reader speaks what is added to a live region, not text that
    // is rewritten to what it already said, so each announcement has to be a
    // change to the document.
    const added: string[] = [];
    const observer = new MutationObserver(records => {
      for (const record of records) {
        record.addedNodes.forEach(node => added.push(node.textContent ?? ''));
      }
    });
    observer.observe(announcer(), { childList: true, characterData: true, subtree: true });

    await moveToDone();
    await waitFor(() => expect(announcer()).toHaveTextContent('Could not move Write the spec to Done.'));
    await waitFor(() => expect(added.length).toBeGreaterThan(0));
    const afterFirst = added.length;

    await moveToDone();
    await waitFor(() => expect(mockedTaskService.move).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(cache.refetch).toHaveBeenCalledTimes(2));
    await new Promise(resolve => setTimeout(resolve, 20));
    observer.disconnect();

    expect(added.length).toBeGreaterThan(afterFirst);
    expect(announcer()).toHaveTextContent('Could not move Write the spec to Done.');
  });
});
