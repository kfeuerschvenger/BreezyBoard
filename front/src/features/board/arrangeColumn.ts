import { arrayMove } from '@dnd-kit/sortable';
import type { Task } from '@/models';

/**
 * Tasks sort by their ordering key, which is a fractional index and so a
 * string. Comparing two of them is a string comparison and never arithmetic.
 *
 * By code point and not by locale. The keys are minted over 0-9A-Za-z, whose
 * code point order is its own order and is the order the database sorts them
 * in; a locale-aware comparison ranks every lowercase letter before every
 * capital, so a key minted for the top of a column would be drawn at the
 * bottom of it.
 */
export const byOrder = (a: Task, b: Task) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0);

export interface ArrangedColumn {
  /** The target column as it reads once the drop is applied. */
  column: Task[];
  /** Where the dragged task ended up in it. */
  position: number;
}

/**
 * Work out how a column reads after a card is dropped into it.
 *
 * The caller uses one arrangement for two things, the optimistic render and
 * the neighbours it sends to the server, so the two cannot disagree about
 * where the card went.
 *
 * Returns null when the drop changes nothing, so the caller can skip the
 * request rather than ask the server to move a card onto itself.
 *
 * @param tasks every task on the board, in any order
 * @param active the task being dragged
 * @param targetColumnId the column it was dropped into
 * @param overTask the card it was dropped onto, if it was dropped onto one
 *   rather than onto the column itself
 */
export const arrangeColumn = (
  tasks: Task[],
  active: Task,
  targetColumnId: string,
  overTask: Task | undefined
): ArrangedColumn | null => {
  const current = tasks.filter(task => task.status === targetColumnId).sort(byOrder);

  if (active.status === targetColumnId) {
    const from = current.findIndex(task => task._id === active._id);
    const to = overTask ? current.findIndex(task => task._id === overTask._id) : current.length - 1;

    if (from === -1 || to === -1 || from === to) {
      return null;
    }

    return { column: arrayMove(current, from, to), position: to };
  }

  // Coming from another column: land where the hovered card sits and push it
  // down, or at the bottom when the drop was on the column itself.
  //
  // Landing where it was dropped is the whole point. The previous contract
  // could only express one past the maximum order of the target column, so a
  // card dragged into the middle of another column always came to rest at
  // the bottom of it, wherever the user released it.
  const overIndex = overTask ? current.findIndex(task => task._id === overTask._id) : -1;
  const position = overIndex === -1 ? current.length : overIndex;
  const column = [...current];

  column.splice(position, 0, { ...active, status: targetColumnId });

  return { column, position };
};

/**
 * The two cards a dropped task came to rest between, as the move endpoint
 * expects them. Null at either end of the column.
 */
export const neighboursOf = ({ column, position }: ArrangedColumn) => ({
  afterId: position > 0 ? column[position - 1]._id : null,
  beforeId: position < column.length - 1 ? column[position + 1]._id : null,
});
