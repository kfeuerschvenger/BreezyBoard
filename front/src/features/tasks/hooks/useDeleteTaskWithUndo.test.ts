import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import type { Task } from '@/models';
import { TaskService } from '@/services';
import { useDeleteTaskWithUndo } from './useDeleteTaskWithUndo';
import type { DeletionCache } from './useDeleteTaskWithUndo';

vi.mock('@/services', () => ({
  TaskService: { delete: vi.fn(), create: vi.fn(), move: vi.fn() },
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
  const { result } = renderHook(() => useDeleteTaskWithUndo({ cache: held.cache }));
  return { ...held, deleteTask: result.current.deleteTask };
};

/** The action of the toast that was shown last. */
const lastAction = () => toast.show.mock.calls.at(-1)?.[0].action as { label: string; onAction: () => void };

beforeEach(() => {
  toast.show.mockReset();
  mockedTaskService.delete.mockReset().mockResolvedValue(undefined);
  mockedTaskService.create.mockReset();
  mockedTaskService.move.mockReset();
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

  it('leaves the card where it is and offers nothing when the server refuses', async () => {
    mockedTaskService.delete.mockRejectedValue(refused(500));
    const { deleteTask, current } = setup();

    await expect(act(() => deleteTask(B))).rejects.toBeDefined();

    expect(current()?.map(entry => entry._id)).toEqual(['a', 'b', 'c', 'z']);
    expect(toast.show).not.toHaveBeenCalled();
  });
});

describe('useDeleteTaskWithUndo, catching it', () => {
  it('makes the card again from what it held and puts it between its old neighbours', async () => {
    const back = { ...B, _id: 'b2', order: 'a3' };
    const placed = { ...B, _id: 'b2', order: 'a0V' };
    mockedTaskService.create.mockResolvedValue(back);
    mockedTaskService.move.mockResolvedValue(placed);
    const { deleteTask, current } = setup();
    await act(() => deleteTask(B));

    await act(async () => lastAction().onAction());

    expect(mockedTaskService.create).toHaveBeenCalledWith('board-1', {
      title: 'Task b',
      description: 'The middle one.',
      status: 'col-todo',
      priority: 'medium',
      color: 'color-blue',
      owner: 'user-ada',
      checklist: [{ text: 'Write it', completed: true }],
    });
    expect(mockedTaskService.move).toHaveBeenCalledWith('b2', 'col-todo', { afterId: 'a', beforeId: 'c' });
    expect(current()?.find(entry => entry._id === 'b2')?.order).toBe('a0V');
    expect(toast.show).toHaveBeenLastCalledWith({ message: 'Caught "Task b".' });
  });

  it('asks for no move when the card was alone in its column', async () => {
    const lonely = task('z', 'a0', { status: 'col-done' });
    mockedTaskService.create.mockResolvedValue({ ...lonely, _id: 'z2' });
    const { deleteTask, current } = setup([A, lonely]);
    await act(() => deleteTask(lonely));

    await act(async () => lastAction().onAction());

    expect(mockedTaskService.move).not.toHaveBeenCalled();
    expect(current()?.map(entry => entry._id)).toEqual(['a', 'z2']);
  });

  it('keeps the card at the foot of its column when putting it back fails', async () => {
    mockedTaskService.create.mockResolvedValue({ ...B, _id: 'b2', order: 'a3' });
    mockedTaskService.move.mockRejectedValue(refused(409));
    const { deleteTask, current } = setup();
    await act(() => deleteTask(B));

    await act(async () => lastAction().onAction());

    expect(current()?.map(entry => entry._id)).toEqual(['a', 'c', 'z', 'b2']);
    expect(toast.show).toHaveBeenLastCalledWith({ message: 'Caught "Task b".' });
  });

  it('asks the server for the list when the board is no longer held', async () => {
    mockedTaskService.create.mockResolvedValue({ ...B, _id: 'b2' });
    const { deleteTask, cache, current } = setup();
    await act(() => deleteTask(B));
    // The board's list was dropped from the cache while the toast was open.
    cache.write(undefined as unknown as Task[]);

    await act(async () => lastAction().onAction());

    expect(cache.refetch).toHaveBeenCalledTimes(1);
    expect(current()).toBeUndefined();
    expect(mockedTaskService.move).not.toHaveBeenCalled();
  });

  it('says so, and offers no second try, when the board refuses the card for good', async () => {
    mockedTaskService.create.mockRejectedValue(refused(400));
    const { deleteTask } = setup();
    await act(() => deleteTask(B));

    await act(async () => lastAction().onAction());

    expect(toast.show).toHaveBeenLastCalledWith({ message: '"Task b" can no longer be brought back.' });
  });

  it('offers to try again when the failure may not repeat, and the second try catches it', async () => {
    mockedTaskService.create.mockRejectedValueOnce(refused(503)).mockResolvedValueOnce({ ...C, _id: 'c2' });
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

    expect(mockedTaskService.create).toHaveBeenCalledTimes(2);
    expect(current()?.map(entry => entry._id)).toContain('c2');
  });
});
