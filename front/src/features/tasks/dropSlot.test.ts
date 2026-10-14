import { describe, expect, it } from 'vitest';
import { centreOf, columnOfOver, dropTargetOf, indexAmong, pointerSlot, sameSlot } from './dropSlot';
import type { BoardSnapshot } from './keyboardDrag';

const snapshot: BoardSnapshot = {
  columns: [
    {
      id: 'todo',
      title: 'To Do',
      tasks: [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
        { id: 'c', title: 'C' },
      ],
    },
    { id: 'doing', title: 'Doing', tasks: [{ id: 'x', title: 'X' }] },
    { id: 'empty', title: 'Empty', tasks: [] },
  ],
};

describe('indexAmong', () => {
  it('counts the midpoints above the held card, so it takes the index after them', () => {
    expect(indexAmong([10, 50, 90], 60)).toBe(2);
  });

  it('is zero above every card and the count of cards below every one', () => {
    expect(indexAmong([10, 50, 90], 5)).toBe(0);
    expect(indexAmong([10, 50, 90], 500)).toBe(3);
  });

  it('is zero for a column with no other card', () => {
    expect(indexAmong([], 123)).toBe(0);
  });

  // The midpoint itself is neither above nor below: the card stays before it,
  // which is what keeps the gap from flickering as the centre lands on one.
  it('keeps a card exactly on a midpoint before it', () => {
    expect(indexAmong([50], 50)).toBe(0);
  });
});

describe('columnOfOver', () => {
  it('names a column hovered directly, and the column of a card hovered', () => {
    expect(columnOfOver(snapshot, 'doing')).toBe('doing');
    expect(columnOfOver(snapshot, 'b')).toBe('todo');
  });

  it('names nothing for a droppable that is neither', () => {
    expect(columnOfOver(snapshot, 'elsewhere')).toBeNull();
  });
});

describe('pointerSlot', () => {
  const held = { top: 80, height: 40 };

  it('reads the index from where the held card sits among the column cards', () => {
    const slot = pointerSlot({
      snapshot,
      activeId: 'x',
      overId: 'b',
      held,
      midpointsOf: () => [30, 90, 150],
    });

    // The centre is 100: past the first two midpoints.
    expect(slot).toEqual({ columnId: 'todo', index: 2 });
  });

  it('asks for the column that is hovered and for no other', () => {
    const asked: string[] = [];
    pointerSlot({
      snapshot,
      activeId: 'x',
      overId: 'doing',
      held,
      midpointsOf: columnId => {
        asked.push(columnId);
        return [];
      },
    });

    expect(asked).toEqual(['doing']);
  });

  it('never lets the held card count itself among the places of its own column', () => {
    const slot = pointerSlot({
      snapshot,
      activeId: 'a',
      overId: 'c',
      held: { top: 900, height: 40 },
      midpointsOf: () => [30, 90],
    });

    // To Do has two other cards, so the end is index 2 and not 3.
    expect(slot).toEqual({ columnId: 'todo', index: 2 });
  });

  // A reading of the screen that still includes the held card, in the frame
  // before it collapses, lists one midpoint too many. The index is bounded by
  // the cards the column really has, or the gap would be drawn past its end.
  it('bounds the index by the cards the column has, whatever the screen reading says', () => {
    const slot = pointerSlot({
      snapshot,
      activeId: 'a',
      overId: 'c',
      held: { top: 900, height: 40 },
      midpointsOf: () => [30, 90, 150],
    });

    expect(slot).toEqual({ columnId: 'todo', index: 2 });
  });

  it('puts a card over an empty column at its start', () => {
    const slot = pointerSlot({ snapshot, activeId: 'a', overId: 'empty', held, midpointsOf: () => [] });

    expect(slot).toEqual({ columnId: 'empty', index: 0 });
  });

  it('is nothing over nothing, and over a droppable it does not know', () => {
    expect(pointerSlot({ snapshot, activeId: 'a', overId: undefined, held, midpointsOf: () => [] })).toBeNull();
    expect(pointerSlot({ snapshot, activeId: 'a', overId: 'elsewhere', held, midpointsOf: () => [] })).toBeNull();
  });

  // Without a measured box the hovered droppable has to answer alone, by the
  // rule the keyboard uses: over a card takes its place, over a column its end.
  it('falls back to the hovered droppable when the held card has not been measured', () => {
    const midpointsOf = () => {
      throw new Error('nothing to measure against');
    };

    expect(pointerSlot({ snapshot, activeId: 'x', overId: 'b', held: null, midpointsOf })).toEqual({
      columnId: 'todo',
      index: 1,
    });
    expect(pointerSlot({ snapshot, activeId: 'x', overId: 'todo', held: null, midpointsOf })).toEqual({
      columnId: 'todo',
      index: 3,
    });
  });
});

describe('dropTargetOf', () => {
  it('names the card standing at the index, whose place the dropped one takes', () => {
    expect(dropTargetOf(snapshot, { columnId: 'todo', index: 1 })).toEqual({ columnId: 'todo', overTaskId: 'b' });
  });

  it('names no card past the end, which is a drop at the bottom', () => {
    expect(dropTargetOf(snapshot, { columnId: 'doing', index: 1 })).toEqual({ columnId: 'doing', overTaskId: null });
    expect(dropTargetOf(snapshot, { columnId: 'empty', index: 0 })).toEqual({ columnId: 'empty', overTaskId: null });
  });

  it('names nothing for a column that is not on the board', () => {
    expect(dropTargetOf(snapshot, { columnId: 'gone', index: 0 })).toBeNull();
  });
});

describe('sameSlot and centreOf', () => {
  it('compares slots by what they name', () => {
    expect(sameSlot({ columnId: 'a', index: 1 }, { columnId: 'a', index: 1 })).toBe(true);
    expect(sameSlot({ columnId: 'a', index: 1 }, { columnId: 'a', index: 2 })).toBe(false);
    expect(sameSlot({ columnId: 'a', index: 1 }, { columnId: 'b', index: 1 })).toBe(false);
    expect(sameSlot(null, null)).toBe(true);
    expect(sameSlot(null, { columnId: 'a', index: 0 })).toBe(false);
  });

  it('puts the centre half the height below the top', () => {
    expect(centreOf({ top: 10, height: 40 })).toBe(30);
  });
});
