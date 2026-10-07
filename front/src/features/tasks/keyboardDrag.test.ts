import { describe, it, expect, vi } from 'vitest';
import type { Task } from '@/models';
import {
  buildSnapshot,
  createAnnouncements,
  createBoardCoordinateGetter,
  createCollisionDetection,
  overIdOfSlot,
  placementOfSlot,
  slotOfOver,
  stepSlot,
} from './keyboardDrag';
import type { BoardSnapshot, KeyboardTarget } from './keyboardDrag';

const makeTask = (id: string, status: string, order: string): Task =>
  ({
    _id: id,
    title: `Task ${id}`,
    description: '',
    status,
    priority: 'low',
    color: '#3B82F6',
    owner: '',
    boardId: 'board-1',
    checklist: [],
    order,
  }) as Task;

const COLUMNS = [
  { id: 'todo', title: 'To Do' },
  { id: 'doing', title: 'Doing' },
  { id: 'empty', title: 'Review' },
  { id: 'done', title: 'Done' },
];

// To Do holds three cards, Doing one, Review none. The shapes differ on
// purpose: every sideways step has to cope with a column longer than, shorter
// than and as empty as the one it leaves. Orders are given out of sequence to
// show that display order, not array order, is what counts.
const TASKS = [
  makeTask('a3', 'todo', 'a2'),
  makeTask('a1', 'todo', 'a0'),
  makeTask('a2', 'todo', 'a1'),
  makeTask('b1', 'doing', 'a0'),
];

const snapshot = buildSnapshot(COLUMNS, TASKS);

describe('buildSnapshot', () => {
  it('lists each column with its cards in display order, named', () => {
    expect(snapshot.columns.map(column => column.tasks.map(task => task.id))).toEqual([
      ['a1', 'a2', 'a3'],
      ['b1'],
      [],
      [],
    ]);
    expect(snapshot.columns[0].tasks[0]).toEqual({ id: 'a1', title: 'Task a1' });
  });
});

describe('slotOfOver and overIdOfSlot', () => {
  it('reads a hovered card as taking its place, in its own column or another', () => {
    expect(slotOfOver(snapshot, 'a2', 'a3')).toEqual({ columnId: 'todo', index: 2 });
    expect(slotOfOver(snapshot, 'a2', 'b1')).toEqual({ columnId: 'doing', index: 0 });
  });

  it('reads a hovered column as its end, which in the own column is its last card', () => {
    expect(slotOfOver(snapshot, 'a2', 'doing')).toEqual({ columnId: 'doing', index: 1 });
    expect(slotOfOver(snapshot, 'a2', 'empty')).toEqual({ columnId: 'empty', index: 0 });
    expect(slotOfOver(snapshot, 'a2', 'todo')).toEqual({ columnId: 'todo', index: 2 });
  });

  it('reads nothing from an id that is neither', () => {
    expect(slotOfOver(snapshot, 'a2', 'ghost')).toBeNull();
  });

  it('names the card to hover in a column that has one at that index, and the column otherwise', () => {
    expect(overIdOfSlot(snapshot, { columnId: 'todo', index: 2 })).toBe('a3');
    expect(overIdOfSlot(snapshot, { columnId: 'doing', index: 0 })).toBe('b1');
    expect(overIdOfSlot(snapshot, { columnId: 'doing', index: 1 })).toBe('doing');
    expect(overIdOfSlot(snapshot, { columnId: 'empty', index: 0 })).toBe('empty');
  });
});

describe('stepSlot', () => {
  const from = (columnId: string, index: number) => ({ columnId, index });

  it('steps up and down inside the column and stops at its ends', () => {
    expect(stepSlot(snapshot, 'a2', from('todo', 1), 'down')).toEqual(from('todo', 2));
    expect(stepSlot(snapshot, 'a2', from('todo', 1), 'up')).toEqual(from('todo', 0));
    expect(stepSlot(snapshot, 'a2', from('todo', 0), 'up')).toBeNull();
    expect(stepSlot(snapshot, 'a2', from('todo', 2), 'down')).toBeNull();
  });

  // The card is already in its own column, so its last place is its last card.
  // In any other column the end, after the last card, is a place too.
  it('lets a card reach the end of a column it is not in, and no further', () => {
    expect(stepSlot(snapshot, 'a2', from('doing', 0), 'down')).toEqual(from('doing', 1));
    expect(stepSlot(snapshot, 'a2', from('doing', 1), 'down')).toBeNull();
  });

  it('goes to the neighbouring column at the same row', () => {
    expect(stepSlot(snapshot, 'a1', from('todo', 0), 'right')).toEqual(from('doing', 0));
    expect(stepSlot(snapshot, 'a2', from('todo', 1), 'right')).toEqual(from('doing', 1));
  });

  it('clamps the row to the end of a shorter column, and to 0 in an empty one', () => {
    expect(stepSlot(snapshot, 'a3', from('todo', 2), 'right')).toEqual(from('doing', 1));
    expect(stepSlot(snapshot, 'a3', from('doing', 1), 'right')).toEqual(from('empty', 0));
  });

  it('clamps going back into the card own column, where the end is its last card', () => {
    expect(stepSlot(snapshot, 'a1', from('doing', 1), 'left')).toEqual(from('todo', 1));
    expect(stepSlot(snapshot, 'a3', from('doing', 1), 'left')).toEqual(from('todo', 1));
  });

  it('stops at the first and last column instead of wrapping', () => {
    expect(stepSlot(snapshot, 'a1', from('todo', 0), 'left')).toBeNull();
    expect(stepSlot(snapshot, 'a1', from('done', 0), 'right')).toBeNull();
  });

  it('refuses a slot in a column the board does not have', () => {
    expect(stepSlot(snapshot, 'a1', from('gone', 0), 'right')).toBeNull();
  });
});

describe('placementOfSlot', () => {
  it('counts the card in its own column once and in another column as an addition', () => {
    expect(placementOfSlot(snapshot, 'a2', { columnId: 'todo', index: 0 })).toEqual({
      columnTitle: 'To Do',
      position: 1,
      total: 3,
    });
    expect(placementOfSlot(snapshot, 'a2', { columnId: 'doing', index: 1 })).toEqual({
      columnTitle: 'Doing',
      position: 2,
      total: 2,
    });
  });
});

describe('announcements', () => {
  const make = (board: BoardSnapshot = snapshot) => createAnnouncements(() => board);
  const active = (id: string) => ({ id });
  const over = (id: string) => ({ id });

  it('names the task and the column when a card is picked up, never an id', () => {
    expect(make().onDragStart({ active: active('a2') })).toBe('Picked up Task a2. To Do, position 2 of 3.');
  });

  it('says where the card is over, in words', () => {
    const announcements = make();
    announcements.onDragStart({ active: active('a2') });
    announcements.onDragOver({ active: active('a2'), over: over('a2') });

    expect(announcements.onDragOver({ active: active('a2'), over: over('b1') })).toBe('Doing, position 1 of 2.');
    expect(announcements.onDragOver({ active: active('a2'), over: over('doing') })).toBe('Doing, position 2 of 2.');
  });

  // dnd-kit reports the card over itself right after the pickup. Speaking it
  // would replace the pickup message a moment after it started.
  it('stays silent about the first hover over the card itself, and only that one', () => {
    const announcements = make();
    announcements.onDragStart({ active: active('a2') });

    expect(announcements.onDragOver({ active: active('a2'), over: over('a2') })).toBeUndefined();
    expect(announcements.onDragOver({ active: active('a2'), over: over('a2') })).toBe('To Do, position 2 of 3.');
  });

  it('says when the card is over nothing', () => {
    expect(make().onDragOver({ active: active('a2'), over: null })).toBe('Task a2 is not over a column.');
  });

  it('reports a drop with the column and place it landed in', () => {
    expect(make().onDragEnd({ active: active('a2'), over: over('b1') })).toBe(
      'Dropped Task a2 in Doing, position 1 of 2.',
    );
  });

  it('says so when the card was dropped where it started', () => {
    expect(make().onDragEnd({ active: active('a2'), over: over('a2') })).toBe(
      'Task a2 was dropped where it started. To Do, position 2 of 3.',
    );
  });

  it('says so when a drop lands on nothing', () => {
    expect(make().onDragEnd({ active: active('a2'), over: null })).toBe('Task a2 was dropped. It was not moved.');
  });

  it('reports a cancel with the place the card is back in', () => {
    expect(make().onDragCancel({ active: active('a2') })).toBe(
      'Move cancelled. Task a2 is back in To Do, position 2 of 3.',
    );
  });
});

describe('the keyboard coordinate getter', () => {
  const rects = new Map<string, { left: number; top: number; width: number; height: number }>([
    ['a1', { left: 20, top: 100, width: 250, height: 80 }],
    ['a2', { left: 20, top: 190, width: 250, height: 80 }],
    ['a3', { left: 20, top: 280, width: 250, height: 80 }],
    ['b1', { left: 340, top: 100, width: 250, height: 80 }],
    ['empty', { left: 680, top: 60, width: 280, height: 600 }],
    ['doing', { left: 340, top: 60, width: 280, height: 600 }],
  ]);

  const setup = (overId: string | null = 'a1', activeId = 'a1') => {
    const target: { current: KeyboardTarget | null } = { current: null };
    const getter = createBoardCoordinateGetter({ getSnapshot: () => snapshot, target });
    const context = {
      active: { id: activeId },
      over: overId ? { id: overId } : null,
      droppableRects: rects,
      // No node: the getter falls back to the rectangles dnd-kit measured.
      droppableContainers: { get: () => undefined },
    };
    const press = (code: string) => {
      const event = { code, preventDefault: vi.fn() } as unknown as KeyboardEvent;
      const coordinates = getter(event, { active: activeId, context, currentCoordinates: { x: 0, y: 0 } } as never);
      return { coordinates, event };
    };
    return { target, press };
  };

  it('moves the overlay to the card in the neighbouring column at the same row', () => {
    const { press, target } = setup();

    expect(press('ArrowRight').coordinates).toEqual({ x: 340, y: 100 });
    expect(target.current).toEqual({ slot: { columnId: 'doing', index: 0 }, overId: 'b1' });
  });

  it('puts the overlay under the last card to mean the end of another column', () => {
    const { press, target } = setup();
    press('ArrowRight');

    expect(press('ArrowDown').coordinates).toEqual({ x: 340, y: 100 + 80 + 12 });
    expect(target.current?.overId).toBe('doing');
  });

  it('puts the overlay at the top of an empty column', () => {
    const { press, target } = setup();
    press('ArrowRight');
    press('ArrowRight');

    expect(target.current).toEqual({ slot: { columnId: 'empty', index: 0 }, overId: 'empty' });
  });

  it('remembers where it is between presses, whatever the drag context has caught up to', () => {
    const { press, target } = setup('a1');
    press('ArrowRight');
    press('ArrowDown');

    expect(target.current?.slot).toEqual({ columnId: 'doing', index: 1 });
  });

  // The column body scrolls, so a card two screens down is not where the
  // measured rectangle says. The overlay is placed from the live position,
  // after the target column has been scrolled to show it.
  it('scrolls the target column to show the card and places the overlay from where it then is', () => {
    const body = {
      scrollTop: 0,
      getBoundingClientRect: () => ({ left: 340, top: 60, bottom: 400, width: 280, height: 340 }),
    };
    const card = {
      getBoundingClientRect: () => ({
        left: 356,
        top: 500 - body.scrollTop,
        bottom: 580 - body.scrollTop,
        width: 250,
        height: 80,
      }),
    };
    const nodes = new Map<string, unknown>([
      ['doing', { node: { current: body } }],
      ['b1', { node: { current: card } }],
    ]);
    const target: { current: KeyboardTarget | null } = { current: null };
    const getter = createBoardCoordinateGetter({ getSnapshot: () => snapshot, target });
    const context = {
      active: { id: 'a1' },
      over: { id: 'a1' },
      droppableRects: rects,
      droppableContainers: { get: (id: string) => nodes.get(id) },
    };

    const coordinates = getter(
      { code: 'ArrowRight', preventDefault: () => {} } as unknown as KeyboardEvent,
      {
        active: 'a1',
        context,
        currentCoordinates: { x: 0, y: 0 },
      } as never,
    );

    expect(body.scrollTop).toBe(180);
    expect(coordinates).toEqual({ x: 356, y: 320 });
  });

  it('answers nothing at the edge of the board and leaves the target alone', () => {
    const { press, target } = setup();

    expect(press('ArrowLeft').coordinates).toBeUndefined();
    expect(target.current).toBeNull();
  });

  it('claims arrow keys and ignores everything else', () => {
    const { press } = setup();
    const arrow = press('ArrowRight');
    const other = press('KeyA');

    expect(arrow.event.preventDefault).toHaveBeenCalled();
    expect(other.event.preventDefault).not.toHaveBeenCalled();
    expect(other.coordinates).toBeUndefined();
  });
});

describe('collision detection', () => {
  it('reports the droppable the keyboard chose while a keyboard drag is going on', () => {
    const detect = createCollisionDetection({ current: { slot: { columnId: 'doing', index: 0 }, overId: 'b1' } });

    expect(detect({} as never)).toEqual([{ id: 'b1' }]);
  });

  // With no keyboard target the pointer is in charge, and it gets dnd-kit's own
  // corner matching untouched.
  it('defers to dnd-kit for a drag the keyboard is not carrying', () => {
    const detect = createCollisionDetection({ current: null });
    const rect = { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 };

    const collisions = detect({
      active: { id: 'a1' },
      collisionRect: rect,
      droppableRects: new Map([['near', rect]]),
      droppableContainers: [{ id: 'near' }],
      pointerCoordinates: null,
    } as never);

    expect(collisions.map(collision => collision.id)).toEqual(['near']);
  });
});
