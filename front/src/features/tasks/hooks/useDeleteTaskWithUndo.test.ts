import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import type { Task } from '@/models';
import { TaskService } from '@/services';
import { useDeleteTaskWithUndo } from './useDeleteTaskWithUndo';
import type { DeletionCache, RemovedTask } from './useDeleteTaskWithUndo';

vi.mock('@/services', () => ({
  TaskService: { delete: vi.fn(), restore: vi.fn() },
}));

const toast = { show: vi.fn(), dismiss: vi.fn() };
vi.mock('@/shared/hooks/useToast', () => ({ useToast: () => toast }));

const mockedTaskService = vi.mocked(TaskService);

const task = (id: string, order: string, overrides: Partial<Task> = {}): Task => ({
  _id: id,
  title: `Task ${id}`,
  status: 'col-todo',
  priority: 'medium',
  color: { _id: 'color-blue', value: '#3B82F6' },
  owner: { _id: 'user-ada', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', avatar: '' },
  boardId: 'board-1',
  checklist: [{ _id: 'item-1', text: 'Write it', completed: true }],
  order,
  ...overrides,
});

const A = task('a', 'a0');
const B = task('b', 'a1', { description: 'The middle one.' });
const C = task('c', 'a2');
const OTHER_COLUMN = task('z', 'a0', { status: 'col-done' });

const refused = (status: number) =>
  new AxiosError('refused', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    data: {},
    headers: {},
    config: { headers: new AxiosHeaders() },
  });

/** A cache over a plain array, so the tests read what the hook wrote. */
const makeCache = (initial: Task[] | undefined) => {
  let list = initial;
  const cache: DeletionCache = {
    read: () => list,
    write: next => {
      list = next;
    },
    replace: next => {
      list = list?.map(entry => (entry._id === next._id ? next : entry));
    },
    refetch: vi.fn().mockResolvedValue(undefined),
  };
  return { cache, current: () => list };
};

const setup = (initial: Task[] | undefined = [A, B, C, OTHER_COLUMN]) => {
  const held = makeCache(initial);
  const onRemoved = vi.fn<(removed: RemovedTask) => void>();
  const { result } = renderHook(() => useDeleteTaskWithUndo({ cache: held.cache, onRemoved }));
  return { ...held, onRemoved, deleteTask: result.current.deleteTask };
};

/** The action of the toast that was shown last. */
const lastAction = () => toast.show.mock.calls.at(-1)?.[0].action as { label: string; onAction: () => void };

beforeEach(() => {
  toast.show.mockReset();
  mockedTaskService.delete.mockReset().mockResolvedValue(undefined);
  mockedTaskService.restore.mockReset();
});

describe('useDeleteTaskWithUndo, deleting', () => {
  it('deletes on the server, takes the card off the board and offers Catch it', async () => {
    const { deleteTask, current } = setup();

    await act(() => deleteTask(B));

    expect(mockedTaskService.delete).toHaveBeenCalledWith('b');
    expect(current()?.map(entry => entry._id)).toEqual(['a', 'c', 'z']);
    expect(toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Card blown away.', action: expect.objectContaining({ label: 'Catch it' }) }),
    );
  });

  it('says which card was removed and which stood below it, so the board can play its exit', async () => {
    const { deleteTask, onRemoved } = setup();

    await act(() => deleteTask(B));

    expect(onRemoved).toHaveBeenCalledTimes(1);
    expect(onRemoved).toHaveBeenCalledWith({ task: B, beforeId: 'c' });
  });

  it('reports no card below the last one of its column, and ignores the other columns', async () => {
    const { deleteTask, onRemoved } = setup();

    await act(() => deleteTask(C));

    expect(onRemoved).toHaveBeenCalledWith({ task: C, beforeId: null });
  });

  it('does not wait for anything to play: the request and the toast come straight after one another', async () => {
    const { deleteTask, onRemoved } = setup();
    const order: string[] = [];
    mockedTaskService.delete.mockImplementation(async () => {
      order.push('request');
    });
    onRemoved.mockImplementation(() => order.push('removed'));
    toast.show.mockImplementation(() => order.push('toast'));

    await act(() => deleteTask(B));

    expect(order).toEqual(['request', 'removed', 'toast']);
  });

  it('leaves the card where it is, plays nothing and offers nothing when the server refuses', async () => {
    mockedTaskService.delete.mockRejectedValue(refused(500));
    const { deleteTask, current, onRemoved } = setup();

    await expect(act(() => deleteTask(B))).rejects.toBeDefined();

    expect(current()?.map(entry => entry._id)).toEqual(['a', 'b', 'c', 'z']);
    expect(onRemoved).not.toHaveBeenCalled();
    expect(toast.show).not.toHaveBeenCalled();
  });
});

describe('useDeleteTaskWithUndo, catching it', () => {
  it('asks the server to restore the same task and puts what it answers back on the board', async () => {
    mockedTaskService.restore.mockResolvedValue(B);
    const { deleteTask, current } = setup();
    await act(() => deleteTask(B));
    expect(current()?.map(entry => entry._id)).not.toContain('b');

    await act(async () => lastAction().onAction());

    expect(mockedTaskService.restore).toHaveBeenCalledWith('b');
    expect(current()?.find(entry => entry._id === 'b')).toEqual(B);
    expect(toast.show).toHaveBeenLastCalledWith({ message: 'Caught "Task b".' });
  });

  it('does not add the card twice when it is already on the board', async () => {
    mockedTaskService.restore.mockResolvedValue(B);
    const { deleteTask, cache, current } = setup();
    await act(() => deleteTask(B));
    // Another tab, or a refetch, brought it back before the toast was pressed.
    cache.write([...(cache.read() ?? []), B]);

    await act(async () => lastAction().onAction());

    expect(current()?.filter(entry => entry._id === 'b')).toHaveLength(1);
  });

  it('asks the server for the list when the board is no longer held', async () => {
    mockedTaskService.restore.mockResolvedValue(B);
    const { deleteTask, cache, current } = setup();
    await act(() => deleteTask(B));
    // The board's list was dropped from the cache while the toast was open.
    cache.write(undefined as unknown as Task[]);

    await act(async () => lastAction().onAction());

    expect(cache.refetch).toHaveBeenCalledTimes(1);
    expect(current()).toBeUndefined();
  });

  it.each([400, 403, 404])('says so, and offers no second try, when the server answers %i', async status => {
    mockedTaskService.restore.mockRejectedValue(refused(status));
    const { deleteTask, current } = setup();
    await act(() => deleteTask(B));

    await act(async () => lastAction().onAction());

    expect(toast.show).toHaveBeenLastCalledWith({ message: '"Task b" can no longer be brought back.' });
    expect(current()?.map(entry => entry._id)).not.toContain('b');
  });

  it('offers to try again when the failure may not repeat, and the second try catches it', async () => {
    mockedTaskService.restore.mockRejectedValueOnce(refused(503)).mockResolvedValueOnce(C);
    const { deleteTask, current } = setup();
    await act(() => deleteTask(C));
    await act(async () => lastAction().onAction());

    expect(toast.show).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: '"Task c" could not be brought back.',
        action: expect.objectContaining({ label: 'Try again' }),
      }),
    );

    await act(async () => lastAction().onAction());

    expect(mockedTaskService.restore).toHaveBeenCalledTimes(2);
    expect(current()?.map(entry => entry._id)).toContain('c');
  });
});
