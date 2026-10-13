import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { DragEndEvent, DragMoveEvent, DragStartEvent } from '@dnd-kit/core';
import { TaskService } from '@/services';
import type { Task } from '@/models';
import { useTaskDragAndDrop } from './useTaskDragAndDrop';
import type { TaskCache } from './useTaskDragAndDrop';

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

// Two cards in To Do and one in Done, so a move has somewhere to come from,
// somewhere to go, and a neighbour at each end to be placed against.
const FIRST = makeTask({ _id: 'task-first', title: 'First', status: TODO, order: 'a0' });
const SECOND = makeTask({ _id: 'task-second', title: 'Second', status: TODO, order: 'a1' });
const DONE_TASK = makeTask({ _id: 'task-done', title: 'Done already', status: DONE, order: 'a0' });
const TASKS = [FIRST, SECOND, DONE_TASK];

const makeCache = (): TaskCache => ({
  write: vi.fn(),
  replace: vi.fn(),
  refetch: vi.fn().mockResolvedValue(undefined),
});

// The event shapes dnd-kit hands the callbacks, narrowed to the two fields
// this hook reads. Building them by hand is what the extraction bought: the
// logic used to be reachable only by simulating a pointer over a layout that
// jsdom does not compute.
const dragStart = (taskId: string) => ({ active: { id: taskId } }) as DragStartEvent;
const dragEnd = (overId: string | null, activatorEvent?: Event) =>
  ({ over: overId ? { id: overId } : null, activatorEvent }) as DragEndEvent;

const renderDrag = (cache: TaskCache, tasks: Task[] = TASKS) =>
  renderHook(() => useTaskDragAndDrop({ tasks, columns: COLUMNS, cache }));

describe('useTaskDragAndDrop picking a card up', () => {
  beforeEach(() => {
    mockedTaskService.move.mockReset();
  });

  it('holds the card that was picked up, for the overlay to draw', () => {
    const { result } = renderDrag(makeCache());

    act(() => result.current.onDragStart(dragStart('task-second')));

    expect(result.current.activeTask).toEqual(SECOND);
  });

  it('holds nothing when the id belongs to no card on this board', () => {
    const { result } = renderDrag(makeCache());

    act(() => result.current.onDragStart(dragStart('task-from-another-board')));

    expect(result.current.activeTask).toBeNull();
  });
});

describe('useTaskDragAndDrop dropping a card', () => {
  beforeEach(() => {
    mockedTaskService.move.mockReset().mockImplementation(async (taskId: string, status: string) => ({
      ...makeTask({ _id: taskId, status }),
      order: 'a5',
    }));
  });

  const drop = async (result: { current: ReturnType<typeof useTaskDragAndDrop> }, from: string, onto: string) => {
    act(() => result.current.onDragStart(dragStart(from)));
    await act(async () => {
      await result.current.onDragEnd(dragEnd(onto));
    });
  };

  it('moves the card to the column it was released on', async () => {
    const { result } = renderDrag(makeCache());

    await drop(result, 'task-first', DONE);

    expect(mockedTaskService.move).toHaveBeenCalledWith('task-first', DONE, expect.anything(), expect.anything());
  });

  // Released over another card rather than over the column itself, which is
  // most drops in practice, since the cards cover the column.
  it('takes the target column from the card it was released over', async () => {
    const { result } = renderDrag(makeCache());

    await drop(result, 'task-first', 'task-done');

    expect(mockedTaskService.move).toHaveBeenCalledWith('task-first', DONE, expect.anything(), expect.anything());
  });

  // The defect this replaced put every cross-column drop at the bottom of the
  // target column, wherever it was released, because it computed one past the
  // column's maximum order instead of reading the neighbours of the position.
  it('names the neighbours of the position it was dropped into, not the end of the column', async () => {
    const { result } = renderDrag(makeCache());

    // Released onto the first card of To Do, so it lands above that card and
    // pushes it down. Nothing is above it, and the card it displaced is
    // below it. The defect this replaced would have sent it to the bottom.
    await drop(result, 'task-done', 'task-first');

    const [, , neighbours] = mockedTaskService.move.mock.calls[0];
    expect(neighbours).toEqual({ afterId: null, beforeId: 'task-first' });
  });

  it('names both neighbours when the card lands between two others', async () => {
    const { result } = renderDrag(makeCache(), [
      FIRST,
      SECOND,
      makeTask({ _id: 'task-third', title: 'Third', status: TODO, order: 'a2' }),
      DONE_TASK,
    ]);

    // Released onto the middle card of a column of three, from elsewhere.
    await drop(result, 'task-done', 'task-second');

    const [, , neighbours] = mockedTaskService.move.mock.calls[0];
    expect(neighbours).toEqual({ afterId: 'task-first', beforeId: 'task-second' });
  });

  it('paints the move before the server answers', async () => {
    const cache = makeCache();
    const { result } = renderDrag(cache);

    await drop(result, 'task-first', DONE);

    const written = vi.mocked(cache.write).mock.calls[0][0];
    expect(written.find(task => task._id === 'task-first')?.status).toBe(DONE);
  });

  it('replaces the card with what the server actually wrote, since it owns the order', async () => {
    const cache = makeCache();
    const { result } = renderDrag(cache);

    await drop(result, 'task-first', DONE);

    expect(cache.replace).toHaveBeenCalledWith(expect.objectContaining({ _id: 'task-first', order: 'a5' }));
  });

  it('lets go of the card once the drop is handled', async () => {
    const { result } = renderDrag(makeCache());

    await drop(result, 'task-first', DONE);

    expect(result.current.activeTask).toBeNull();
  });

  // Landing in another column replaces the card with a new element, and the
  // handle the person was holding is gone with the old one.
  it('asks for focus on the drag handle after a keyboard drop, and not after a pointer drop', async () => {
    const { result } = renderDrag(makeCache());

    act(() => result.current.onDragStart(dragStart('task-first')));
    await act(async () => {
      await result.current.onDragEnd(dragEnd(DONE, new MouseEvent('pointerdown')));
    });
    expect(result.current.mover.focusRequest).toBeNull();

    act(() => result.current.onDragStart(dragStart('task-second')));
    await act(async () => {
      await result.current.onDragEnd(dragEnd(DONE, new KeyboardEvent('keydown', { code: 'Space' })));
    });
    expect(result.current.mover.focusRequest).toMatchObject({ taskId: 'task-second', target: 'drag-handle' });
  });

  it('lets go of the card when the drag is cancelled, without moving anything', () => {
    const cache = makeCache();
    const { result } = renderDrag(cache);

    act(() => result.current.onDragStart(dragStart('task-first')));
    act(() => result.current.onDragCancel());

    expect(result.current.activeTask).toBeNull();
    expect(mockedTaskService.move).not.toHaveBeenCalled();
    expect(cache.write).not.toHaveBeenCalled();
  });

  it('does nothing at all when the card is released outside every column', async () => {
    const cache = makeCache();
    const { result } = renderDrag(cache);

    await drop(result, 'task-first', null as unknown as string);

    expect(mockedTaskService.move).not.toHaveBeenCalled();
    expect(cache.write).not.toHaveBeenCalled();
    expect(result.current.activeTask).toBeNull();
  });

  it('does nothing when the drop target is neither a column nor a card', async () => {
    const cache = makeCache();
    const { result } = renderDrag(cache);

    await drop(result, 'task-first', 'some-other-droppable');

    expect(mockedTaskService.move).not.toHaveBeenCalled();
    expect(cache.write).not.toHaveBeenCalled();
  });
});

describe('useTaskDragAndDrop when a move fails', () => {
  beforeEach(() => {
    mockedTaskService.move.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  const drop = async (result: { current: ReturnType<typeof useTaskDragAndDrop> }, from: string, onto: string) => {
    act(() => result.current.onDragStart(dragStart(from)));
    await act(async () => {
      await result.current.onDragEnd(dragEnd(onto));
    });
  };

  // Restoring a snapshot taken before the drag would be wrong: by the time
  // the failure arrives it may be older than changes that did land.
  // dnd-kit announces the drop and cannot know it failed, so the failure is the
  // mover's to say, once, in its own live region.
  it('announces the failure by task and column name', async () => {
    mockedTaskService.move.mockRejectedValue(new Error('409 conflict'));
    const { result } = renderDrag(makeCache());

    await drop(result, 'task-first', DONE);

    expect(result.current.mover.announcement).toBe('Could not move First to Done.');
  });

  it('asks the server what the board looks like rather than restoring a snapshot', async () => {
    const cache = makeCache();
    mockedTaskService.move.mockRejectedValue(new Error('409 conflict'));
    const { result } = renderDrag(cache);

    await drop(result, 'task-first', DONE);

    expect(cache.refetch).toHaveBeenCalled();
    expect(cache.replace).not.toHaveBeenCalled();
  });

  // Finding P2-6. A second drag aborts the first, and the abandoned request
  // must not touch the board afterwards: the newer move owns it now.
  it('leaves the board alone when its own request was abandoned for a newer one', async () => {
    const cache = makeCache();

    let abortFirst: () => void = () => {};
    mockedTaskService.move.mockImplementationOnce(
      (_id, _status, _between, signal) =>
        new Promise((_resolve, reject) => {
          abortFirst = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          signal?.addEventListener('abort', abortFirst);
        })
    );

    const { result } = renderDrag(cache);

    act(() => result.current.onDragStart(dragStart('task-first')));
    let firstDrop: Promise<void> = Promise.resolve();
    act(() => {
      firstDrop = result.current.onDragEnd(dragEnd(DONE));
    });

    // The second drag aborts the first mid-flight.
    mockedTaskService.move.mockResolvedValueOnce(makeTask({ _id: 'task-second', status: DONE, order: 'a9' }));
    await act(async () => {
      result.current.onDragStart(dragStart('task-second'));
    });
    await act(async () => {
      await result.current.onDragEnd(dragEnd(DONE));
      await firstDrop;
    });

    // Only the second move's answer reached the cache. The abandoned one
    // neither replaced a card nor triggered a refetch.
    expect(cache.replace).toHaveBeenCalledTimes(1);
    expect(cache.replace).toHaveBeenCalledWith(expect.objectContaining({ _id: 'task-second' }));
    expect(cache.refetch).not.toHaveBeenCalled();
  });
});

// A pointer drag turned into a slot from the held card's centre against the
// cards of the column under it. jsdom has no layout, so the midpoints of the
// column's cards are supplied and the held card's box is part of the event.
describe('useTaskDragAndDrop where a held card would land', () => {
  beforeEach(() => {
    mockedTaskService.move.mockReset().mockImplementation(async (taskId: string, status: string) => ({
      ...makeTask({ _id: taskId, status }),
      order: 'a5',
    }));
  });

  // The Done column holds one card, whose midpoint is at 50.
  const measureMidpoints = vi.fn((columnId: string) => (columnId === DONE ? [50] : [20, 60]));

  const renderMeasured = (cache: TaskCache = makeCache()) =>
    renderHook(() => useTaskDragAndDrop({ tasks: TASKS, columns: COLUMNS, cache, measureMidpoints }));

  const pointerMove = (taskId: string, overId: string, centre: number) =>
    ({
      active: { id: taskId, rect: { current: { initial: null, translated: { top: centre - 20, height: 40 } } } },
      over: { id: overId },
      activatorEvent: new MouseEvent('pointerdown'),
    }) as unknown as DragMoveEvent;

  const pointerEnd = (taskId: string, overId: string, centre: number) =>
    pointerMove(taskId, overId, centre) as unknown as DragEndEvent;

  it('opens the gap where the card was when it is picked up', () => {
    const { result } = renderMeasured();

    act(() => result.current.onDragStart(dragStart('task-second')));

    expect(result.current.slot).toEqual({ columnId: TODO, index: 1 });
  });

  it('puts the gap after a card whose midpoint the held card has passed', () => {
    const { result } = renderMeasured();

    act(() => result.current.onDragStart(dragStart('task-first')));
    act(() => result.current.onDragMove(pointerMove('task-first', 'task-done', 80)));

    expect(result.current.slot).toEqual({ columnId: DONE, index: 1 });
  });

  it('puts the gap before a card whose midpoint the held card has not reached', () => {
    const { result } = renderMeasured();

    act(() => result.current.onDragStart(dragStart('task-first')));
    act(() => result.current.onDragMove(pointerMove('task-first', 'task-done', 30)));

    expect(result.current.slot).toEqual({ columnId: DONE, index: 0 });
  });

  it('keeps the held card out of its own column when it counts the places', () => {
    const { result } = renderMeasured();

    // Two cards in To Do, one of them held: one other card, so index 1 is the end.
    act(() => result.current.onDragStart(dragStart('task-first')));
    act(() => result.current.onDragMove(pointerMove('task-first', 'task-second', 500)));

    expect(result.current.slot).toEqual({ columnId: TODO, index: 1 });
    expect(measureMidpoints).toHaveBeenCalledWith(TODO, 'task-first');
  });

  it('lets go of the slot when the drag is cancelled', () => {
    const { result } = renderMeasured();

    act(() => result.current.onDragStart(dragStart('task-first')));
    act(() => result.current.onDragCancel());

    expect(result.current.slot).toBeNull();
  });

  // The drop must use the place the gap showed, not the card under the pointer.
  it('names the neighbours the gap showed when it is released after a card', async () => {
    const { result } = renderMeasured();

    act(() => result.current.onDragStart(dragStart('task-first')));
    await act(async () => {
      await result.current.onDragEnd(pointerEnd('task-first', 'task-done', 80));
    });

    const [, status, neighbours] = mockedTaskService.move.mock.calls[0];
    expect(status).toBe(DONE);
    expect(neighbours).toEqual({ afterId: 'task-done', beforeId: null });
  });

  it('names the neighbours the gap showed when it is released before a card', async () => {
    const { result } = renderMeasured();

    act(() => result.current.onDragStart(dragStart('task-first')));
    await act(async () => {
      await result.current.onDragEnd(pointerEnd('task-first', 'task-done', 30));
    });

    const [, , neighbours] = mockedTaskService.move.mock.calls[0];
    expect(neighbours).toEqual({ afterId: null, beforeId: 'task-done' });
  });

  it('sends nothing when the gap is where the card started', async () => {
    const { result } = renderMeasured();

    // The first of two cards, released above the midpoint of the other one.
    act(() => result.current.onDragStart(dragStart('task-first')));
    await act(async () => {
      await result.current.onDragEnd(pointerEnd('task-first', 'task-second', 5));
    });

    expect(mockedTaskService.move).not.toHaveBeenCalled();
  });
});

describe('useTaskDragAndDrop landing', () => {
  beforeEach(() => {
    mockedTaskService.move.mockReset().mockImplementation(async (taskId: string, status: string) => ({
      ...makeTask({ _id: taskId, status }),
      order: 'a5',
    }));
  });

  const dropOnDone = async (result: { current: ReturnType<typeof useTaskDragAndDrop> }) => {
    act(() => result.current.onDragStart(dragStart('task-first')));
    await act(async () => {
      await result.current.onDragEnd(dragEnd(DONE));
    });
  };

  it('marks the card that was dropped, so it can settle into place', async () => {
    const { result } = renderDrag(makeCache());

    await dropOnDone(result);

    expect(result.current.landedId).toBe('task-first');
  });

  it('clears the mark when that card has finished, and only for that card', async () => {
    const { result } = renderDrag(makeCache());
    await dropOnDone(result);

    act(() => result.current.onLandingEnd('task-second'));
    expect(result.current.landedId).toBe('task-first');

    act(() => result.current.onLandingEnd('task-first'));
    expect(result.current.landedId).toBeNull();
  });

  it('marks nothing for a drag that was cancelled', () => {
    const { result } = renderDrag(makeCache());

    act(() => result.current.onDragStart(dragStart('task-first')));
    act(() => result.current.onDragCancel());

    expect(result.current.landedId).toBeNull();
  });

  it('marks nothing for a card released outside every column', async () => {
    const { result } = renderDrag(makeCache());

    act(() => result.current.onDragStart(dragStart('task-first')));
    await act(async () => {
      await result.current.onDragEnd(dragEnd(null));
    });

    expect(result.current.landedId).toBeNull();
  });
});
