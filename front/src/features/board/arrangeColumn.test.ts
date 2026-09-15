import { describe, expect, it } from 'vitest';
import type { Task } from '@/models';
import { arrangeColumn, byOrder, neighboursOf } from './arrangeColumn';

const TODO = 'col-todo';
const DOING = 'col-doing';

const task = (id: string, status: string, order: string): Task =>
  ({
    _id: id,
    title: id,
    description: '',
    status,
    priority: 'low',
    color: '#000000',
    owner: '',
    boardId: 'board-1',
    checklist: [],
    order,
  }) as Task;

// Deliberately out of order in the array, so anything that relies on array
// position rather than on the ordering key fails here.
const board = [
  task('c', TODO, 'a2'),
  task('a', TODO, 'a0'),
  task('b', TODO, 'a1'),
  task('x', DOING, 'a0'),
  task('y', DOING, 'a1'),
];

const titlesOf = (tasks: Task[]) => tasks.map(entry => entry._id);

describe('byOrder', () => {
  it('compares ordering keys as strings, not as numbers', () => {
    // 'a10' is after 'a9' as a key even though 10 is not after 9 in the way
    // a numeric read of the suffix would suggest. Keys are opaque strings.
    expect([task('later', TODO, 'a9'), task('earlier', TODO, 'a10')].sort(byOrder).map(entry => entry._id)).toEqual([
      'earlier',
      'later',
    ]);
  });
});

describe('arrangeColumn, within one column', () => {
  it('moves a card up to the position of the card it was dropped on', () => {
    const arranged = arrangeColumn(board, task('c', TODO, 'a2'), TODO, task('a', TODO, 'a0'));

    expect(titlesOf(arranged!.column)).toEqual(['c', 'a', 'b']);
    expect(arranged!.position).toBe(0);
  });

  it('moves a card down to the position of the card it was dropped on', () => {
    const arranged = arrangeColumn(board, task('a', TODO, 'a0'), TODO, task('c', TODO, 'a2'));

    expect(titlesOf(arranged!.column)).toEqual(['b', 'c', 'a']);
    expect(arranged!.position).toBe(2);
  });

  it('reports no change when a card is dropped on itself', () => {
    expect(arrangeColumn(board, task('b', TODO, 'a1'), TODO, task('b', TODO, 'a1'))).toBeNull();
  });

  it('sends a card to the bottom when it is dropped on its own column rather than on a card', () => {
    const arranged = arrangeColumn(board, task('a', TODO, 'a0'), TODO, undefined);

    expect(titlesOf(arranged!.column)).toEqual(['b', 'c', 'a']);
  });
});

describe('arrangeColumn, across columns', () => {
  it('lands where it was dropped instead of at the bottom', () => {
    // This is the defect the neighbour contract fixes. The previous
    // implementation computed one past the maximum order of the target
    // column, so this card always came to rest after 'y' however far up the
    // column it was released.
    const arranged = arrangeColumn(board, task('a', TODO, 'a0'), DOING, task('y', DOING, 'a1'));

    expect(titlesOf(arranged!.column)).toEqual(['x', 'a', 'y']);
    expect(arranged!.position).toBe(1);
  });

  it('lands at the bottom when dropped on the column itself', () => {
    const arranged = arrangeColumn(board, task('a', TODO, 'a0'), DOING, undefined);

    expect(titlesOf(arranged!.column)).toEqual(['x', 'y', 'a']);
  });

  it('carries the new column on the arranged card, so the optimistic render is correct', () => {
    const arranged = arrangeColumn(board, task('a', TODO, 'a0'), DOING, undefined);

    expect(arranged!.column.at(-1)!.status).toBe(DOING);
  });

  it('is the only card in an empty column', () => {
    const arranged = arrangeColumn([task('a', TODO, 'a0')], task('a', TODO, 'a0'), 'col-empty', undefined);

    expect(titlesOf(arranged!.column)).toEqual(['a']);
    expect(arranged!.position).toBe(0);
  });
});

describe('neighboursOf', () => {
  it('names both neighbours in the middle of a column', () => {
    const arranged = arrangeColumn(board, task('a', TODO, 'a0'), DOING, task('y', DOING, 'a1'));

    expect(neighboursOf(arranged!)).toEqual({ afterId: 'x', beforeId: 'y' });
  });

  it('leaves afterId null at the top of a column', () => {
    const arranged = arrangeColumn(board, task('c', TODO, 'a2'), TODO, task('a', TODO, 'a0'));

    expect(neighboursOf(arranged!)).toEqual({ afterId: null, beforeId: 'a' });
  });

  it('leaves beforeId null at the bottom of a column', () => {
    const arranged = arrangeColumn(board, task('a', TODO, 'a0'), DOING, undefined);

    expect(neighboursOf(arranged!)).toEqual({ afterId: 'y', beforeId: null });
  });

  it('leaves both null in an empty column, which is what tells the server to mint a first key', () => {
    const arranged = arrangeColumn([task('a', TODO, 'a0')], task('a', TODO, 'a0'), 'col-empty', undefined);

    expect(neighboursOf(arranged!)).toEqual({ afterId: null, beforeId: null });
  });
});
