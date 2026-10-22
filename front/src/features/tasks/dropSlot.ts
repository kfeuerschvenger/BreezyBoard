import type { BoardSnapshot, Slot } from './keyboardDrag';
import { slotOfOver } from './keyboardDrag';

/**
 * Where a card held with the pointer would land, and what a drop there asks
 * the mover to do.
 *
 * The keyboard already works in slots: a column and the index the held card
 * would take once dropped (`keyboardDrag`). The pointer is brought to the same
 * model so that one value, the slot, drives all three things that need to
 * agree: the gap drawn in the column, the highlight on it, and the move that
 * a drop sends. A gap that showed one place and a drop that used another would
 * be worse than no gap at all.
 */

/** The vertical extent of something on screen, in the same coordinates as another. */
export interface VerticalSpan {
  top: number;
  height: number;
}

export const centreOf = ({ top, height }: VerticalSpan): number => top + height / 2;

/** True when two slots name the same place, so a state update can be skipped. */
export const sameSlot = (a: Slot | null, b: Slot | null): boolean =>
  a === b || (a !== null && b !== null && a.columnId === b.columnId && a.index === b.index);

/**
 * The column a hovered droppable belongs to: the column itself, or the column
 * a hovered card sits in. Null for anything that is neither.
 */
export function columnOfOver(snapshot: BoardSnapshot, overId: string): string | null {
  const column = snapshot.columns.find(candidate => candidate.id === overId);
  if (column) return column.id;

  return snapshot.columns.find(candidate => candidate.tasks.some(task => task.id === overId))?.id ?? null;
}

/**
 * How many of a column's other cards sit wholly above the held card's centre,
 * which is the index the held card takes among them.
 *
 * This is the rule of the reference design: the card under the pointer decides
 * before or after by which half of it the held card's centre is in, which is
 * the same as comparing the centre with that card's midpoint. Counting
 * midpoints above the centre says it for every card at once, so it needs no
 * "which card is hovered" step and cannot disagree with itself between two
 * cards.
 *
 * `midpoints` are read from the screen as it is now, with the gap in it. That
 * does not chase itself: opening the gap above a card moves the card down, so
 * a held card that was above its midpoint stays above it, and one that has
 * just crossed it is further past it than before. The gap follows the held
 * card without oscillating.
 *
 * @param midpoints the vertical midpoints of the column's cards other than the
 *   held one, top to bottom
 * @param centreY the vertical centre of the held card
 */
export function indexAmong(midpoints: readonly number[], centreY: number): number {
  let index = 0;
  while (index < midpoints.length && midpoints[index] < centreY) index += 1;
  return index;
}

export interface PointerSlotInput {
  snapshot: BoardSnapshot;
  activeId: string;
  /** What the collision detection reports under the held card, if anything. */
  overId: string | undefined;
  /** The held card's current box, or null when dnd-kit has not measured it. */
  held: VerticalSpan | null;
  /** The midpoints of one column's cards other than the held one, read from the screen. */
  midpointsOf: (columnId: string) => readonly number[];
}

/**
 * The slot a pointer drag is over, or null over nothing.
 *
 * The column comes from the hovered droppable and the index from geometry.
 * Without a measured box the hovered droppable has to answer alone, by the
 * rule the keyboard uses: over a card takes its place and pushes it down, over
 * a column means its end.
 */
export function pointerSlot({ snapshot, activeId, overId, held, midpointsOf }: PointerSlotInput): Slot | null {
  if (overId === undefined) return null;

  const columnId = columnOfOver(snapshot, overId);
  if (!columnId) return null;

  if (!held) return slotOfOver(snapshot, activeId, overId);

  const column = snapshot.columns.find(candidate => candidate.id === columnId);
  if (!column) return null;

  // The held card never counts among a column's "other cards", so the index
  // stops one place earlier in its own column than in any other.
  const others = column.tasks.filter(task => task.id !== activeId).length;
  return { columnId, index: Math.min(indexAmong(midpointsOf(columnId), centreOf(held)), others) };
}

/** What a drop in a slot asks the mover for. */
export interface DropTarget {
  columnId: string;
  /**
   * The card whose place the dropped one takes, pushing it down, or null for
   * the end of the column. It is the card that stands at the slot's index in
   * the column as it is now, which is the contract `arrangeColumn` takes.
   */
  overTaskId: string | null;
}

export function dropTargetOf(snapshot: BoardSnapshot, slot: Slot): DropTarget | null {
  const column = snapshot.columns.find(candidate => candidate.id === slot.columnId);
  if (!column) return null;

  return { columnId: column.id, overTaskId: column.tasks[slot.index]?.id ?? null };
}
