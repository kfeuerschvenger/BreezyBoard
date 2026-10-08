import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { TaskService } from '@/services';
import type { Task } from '@/models';
import { useTaskMover } from './useTaskMover';
import type { TaskCache } from './useTaskMover';
import { useTaskDragAndDrop } from './useTaskDragAndDrop';

vi.mock('@/services', () => ({
  TaskService: { move: vi.fn() },
}));

const mockedTaskService = vi.mocked(TaskService);

const TODO = 'col-todo';
const DONE = 'col-done';
const COLUMNS = [
  { id: TODO, title: 'To Do' },
  { id: DONE, title: 'Done' },
];

const makeTask = (overrides: Partial<Task>): Task => ({
  _id: 'task-default',
  title: 'Untitled',
  description: '',
  status: TODO,
  priority: 'low',
  color: '#3B82F6',
  owner: '',
  boardId: 'board-1',
  checklist: [],
  order: 'a0',
  ...overrides,
});

const FIRST = makeTask({ _id: 'task-first', title: 'First', status: TODO, order: 'a0' });
const SECOND = makeTask({ _id: 'task-second', title: 'Second', status: TODO, order: 'a1' });
const DONE_A = makeTask({ _id: 'task-done-a', title: 'Done A', status: DONE, order: 'a0' });
const DONE_B = makeTask({ _id: 'task-done-b', title: 'Done B', status: DONE, order: 'a1' });
const TASKS = [FIRST, SECOND, DONE_A, DONE_B];

const makeCache = (): TaskCache => ({
  write: vi.fn(),
  replace: vi.fn(),
  refetch: vi.fn().mockResolvedValue(undefined),
});

describe('useTaskMover moving a card to a column from the menu', () => {
  beforeEach(() => {
    mockedTaskService.move.mockReset().mockImplementation(async (taskId: string, status: string) => ({
      ...makeTask({ _id: taskId, status }),
      order: 'a5',
    }));
  });

  // The menu has no position to offer, so the card goes where a drop on a
  // column's empty space goes: the bottom.
  it('puts the card after the last card of the target column', async () => {
    const { result } = renderHook(() => useTaskMover({ tasks: TASKS, cache: makeCache() }));

    await act(async () => {
      await result.current.moveToColumn(FIRST, { id: DONE, title: 'Done' });
    });

    expect(mockedTaskService.move).toHaveBeenCalledWith(
      'task-first',
      DONE,
      { afterId: 'task-done-b', beforeId: null },
      expect.any(AbortSignal),
    );
  });

  it('sends a card into an empty column with no neighbours at all', async () => {
    const { result } = renderHook(() => useTaskMover({ tasks: [FIRST, SECOND], cache: makeCache() }));

    await act(async () => {
      await result.current.moveToColumn(FIRST, { id: DONE, title: 'Done' });
    });

    expect(mockedTaskService.move.mock.calls[0][2]).toEqual({ afterId: null, beforeId: null });
  });

  it('paints the move in the cache before the server answers, then keeps what the server wrote', async () => {
    const cache = makeCache();
    const { result } = renderHook(() => useTaskMover({ tasks: TASKS, cache }));

    await act(async () => {
      await result.current.moveToColumn(FIRST, { id: DONE, title: 'Done' });
    });

    const written = vi.mocked(cache.write).mock.calls[0][0];
    expect(written.find(task => task._id === 'task-first')?.status).toBe(DONE);
    expect(cache.replace).toHaveBeenCalledWith(expect.objectContaining({ _id: 'task-first', order: 'a5' }));
  });

  it('announces the result by task and column name', async () => {
    const { result } = renderHook(() => useTaskMover({ tasks: TASKS, cache: makeCache() }));

    await act(async () => {
      await result.current.moveToColumn(FIRST, { id: DONE, title: 'Done' });
    });

    expect(result.current.announcement).toBe('Moved First to Done.');
  });

  it('announces a failure instead of staying silent, and asks the server for the truth', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const cache = makeCache();
    mockedTaskService.move.mockRejectedValue(new Error('409 conflict'));
    const { result } = renderHook(() => useTaskMover({ tasks: TASKS, cache }));

    await act(async () => {
      await result.current.moveToColumn(FIRST, { id: DONE, title: 'Done' });
    });

    expect(result.current.announcement).toBe('Could not move First to Done.');
    expect(cache.refetch).toHaveBeenCalled();
    expect(cache.replace).not.toHaveBeenCalled();
  });

  it('asks for focus on the moved task, and asks again for a second move of the same one', async () => {
    const { result } = renderHook(() => useTaskMover({ tasks: TASKS, cache: makeCache() }));

    await act(async () => {
      await result.current.moveToColumn(FIRST, { id: DONE, title: 'Done' });
    });
    const firstRequest = result.current.focusRequest;
    await act(async () => {
      await result.current.moveToColumn(FIRST, { id: TODO, title: 'To Do' });
    });

    expect(firstRequest).toMatchObject({ taskId: 'task-first' });
    expect(result.current.focusRequest).toMatchObject({ taskId: 'task-first' });
    expect(result.current.focusRequest).not.toBe(firstRequest);
  });

  it('aims a menu move at the menu button and a requested focus at whichever control was asked for', () => {
    const { result } = renderHook(() => useTaskMover({ tasks: TASKS, cache: makeCache() }));

    act(() => result.current.requestFocus('task-first', 'drag-handle'));
    expect(result.current.focusRequest).toMatchObject({ taskId: 'task-first', target: 'drag-handle' });

    act(() => {
      void result.current.moveToColumn(FIRST, { id: DONE, title: 'Done' });
    });
    expect(result.current.focusRequest).toMatchObject({ taskId: 'task-first', target: 'move-trigger' });
  });

  it('says whatever it is asked to in its live region', () => {
    const { result } = renderHook(() => useTaskMover({ tasks: TASKS, cache: makeCache() }));

    act(() => result.current.announce('Could not move First to Done.'));

    expect(result.current.announcement).toBe('Could not move First to Done.');
  });

  it('gives an announcement a new id even when its words are the same as the last one', () => {
    const { result } = renderHook(() => useTaskMover({ tasks: TASKS, cache: makeCache() }));

    act(() => result.current.announce('Could not move First to Done.'));
    const first = result.current.announcementId;
    act(() => result.current.announce('Could not move First to Done.'));

    expect(result.current.announcement).toBe('Could not move First to Done.');
    expect(result.current.announcementId).not.toBe(first);
  });
});

describe('useTaskMover sharing its in-flight guard with dragging', () => {
  const dragStart = (taskId: string) => ({ active: { id: taskId } }) as DragStartEvent;
  const dragEnd = (overId: string) => ({ over: { id: overId } }) as DragEndEvent;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  // Finding P2-6 applies to the menu exactly as it does to a second drag: if
  // the two paths kept separate guards, a slow menu move could resolve after a
  // drag and roll its stale snapshot over it.
  it('abandons a slow menu move when a drag starts another, leaving the board to the drag', async () => {
    const cache = makeCache();

    mockedTaskService.move.mockReset().mockImplementationOnce(
      (_id, _status, _between, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }),
    );

    const { result } = renderHook(() => useTaskDragAndDrop({ tasks: TASKS, columns: COLUMNS, cache }));

    let menuMove: Promise<unknown> = Promise.resolve();
    act(() => {
      menuMove = result.current.mover.moveToColumn(FIRST, { id: DONE, title: 'Done' });
    });

    mockedTaskService.move.mockResolvedValueOnce(makeTask({ _id: 'task-second', status: DONE, order: 'a9' }));
    act(() => result.current.onDragStart(dragStart('task-second')));
    await act(async () => {
      await result.current.onDragEnd(dragEnd(DONE));
      await menuMove;
    });

    expect(cache.replace).toHaveBeenCalledTimes(1);
    expect(cache.replace).toHaveBeenCalledWith(expect.objectContaining({ _id: 'task-second' }));
    expect(cache.refetch).not.toHaveBeenCalled();
    // The abandoned move said nothing: the newer one owns the announcement.
    expect(result.current.mover.announcement).toBe('');
  });
});
