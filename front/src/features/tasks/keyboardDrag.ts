import type { CollisionDetection, KeyboardCoordinateGetter } from '@dnd-kit/core';
import { closestCorners } from '@dnd-kit/core';
import type { Task } from '@/models';
import { byOrder } from '@/features/board';

/**
 * Keyboard dragging on a board of columns.
 *
 * dnd-kit's own `sortableKeyboardCoordinates` picks the next target by
 * geometry: the droppable whose corners are nearest in the direction pressed.
 * On a row of columns that is unpredictable. A key press can skip a column,
 * land on a card in a column that is not adjacent, or answer "Down" with a card
 * that belongs to the neighbouring column because it happens to sit lower on
 * the screen. A person who cannot see the board cannot correct for that.
 *
 * So the keyboard model here is not geometric. A card has a position in a
 * column, the arrow keys step through those positions, and the screen is only
 * asked where the target is so the overlay can be drawn over it.
 */

/** One card of the board, as keyboard dragging and its announcements need it. */
export interface SnapshotTask {
  id: string;
  title: string;
}

export interface SnapshotColumn {
  id: string;
  title: string;
  /** In display order. */
  tasks: SnapshotTask[];
}

/** The board's columns and cards in display order, taken at one moment. */
export interface BoardSnapshot {
  columns: SnapshotColumn[];
}

export type KeyboardDirection = 'up' | 'down' | 'left' | 'right';

/**
 * Where the held card would end up: the column and its index in that column
 * once the drop is applied. In the card's own column that is 0 to n-1. In any
 * other column it is 0 to n, where n is the end of the column.
 */
export interface Slot {
  columnId: string;
  index: number;
}

/** A slot together with the droppable the drag context should report as hovered. */
export interface KeyboardTarget {
  slot: Slot;
  overId: string;
}

export interface Placement {
  columnTitle: string;
  /** One based, for people. */
  position: number;
  total: number;
}

export function buildSnapshot(columns: { id: string; title: string }[], tasks: Task[]): BoardSnapshot {
  return {
    columns: columns.map(column => ({
      id: column.id,
      title: column.title,
      tasks: tasks
        .filter(task => task.status === column.id)
        .sort(byOrder)
        .map(task => ({ id: task._id, title: task.title })),
    })),
  };
}

function findCard(snapshot: BoardSnapshot, taskId: string) {
  for (const column of snapshot.columns) {
    const index = column.tasks.findIndex(task => task.id === taskId);
    if (index !== -1) return { column, index, task: column.tasks[index] };
  }
  return null;
}

/** The last index a card can take in a column: the end of any column but its own. */
function lastIndex(activeId: string, column: SnapshotColumn): number {
  const isOwn = column.tasks.some(task => task.id === activeId);
  return isOwn ? column.tasks.length - 1 : column.tasks.length;
}

/**
 * The slot a hovered droppable stands for. Hovering a card means taking its
 * place and pushing it down; hovering a column itself means its end.
 */
export function slotOfOver(snapshot: BoardSnapshot, activeId: string, overId: string): Slot | null {
  const columnHovered = snapshot.columns.find(column => column.id === overId);
  if (columnHovered) return { columnId: columnHovered.id, index: lastIndex(activeId, columnHovered) };

  const card = findCard(snapshot, overId);
  return card ? { columnId: card.column.id, index: card.index } : null;
}

/** The droppable that makes a drop land in a slot, which is `slotOfOver` run backwards. */
export function overIdOfSlot(snapshot: BoardSnapshot, slot: Slot): string | null {
  const column = snapshot.columns.find(candidate => candidate.id === slot.columnId);
  if (!column) return null;

  // Past the last card is the end of a column the card is not in, which is the
  // column itself. A card's own column has no place past its last card.
  if (slot.index >= column.tasks.length) return column.id;
  return column.tasks[slot.index]?.id ?? null;
}

/**
 * The slot one arrow key away, or null at the edge of the board.
 *
 * Up and down step one place within the column and stop at its ends. Left and
 * right go to the neighbouring column and keep the index, clamped to that
 * column's end: a card third from the top lands third from the top, or at the
 * bottom of a column that has fewer. Keeping the row is what makes a run of
 * sideways presses read as a straight line across the board.
 */
export function stepSlot(
  snapshot: BoardSnapshot,
  activeId: string,
  from: Slot,
  direction: KeyboardDirection,
): Slot | null {
  const columnIndex = snapshot.columns.findIndex(column => column.id === from.columnId);
  if (columnIndex === -1) return null;

  if (direction === 'up' || direction === 'down') {
    const column = snapshot.columns[columnIndex];
    const index = from.index + (direction === 'down' ? 1 : -1);
    if (index < 0 || index > lastIndex(activeId, column)) return null;
    return { columnId: column.id, index };
  }

  const target = snapshot.columns[columnIndex + (direction === 'right' ? 1 : -1)];
  if (!target) return null;
  return { columnId: target.id, index: Math.min(from.index, lastIndex(activeId, target)) };
}

/** Where a slot is, in the words an announcement uses. */
export function placementOfSlot(snapshot: BoardSnapshot, activeId: string, slot: Slot): Placement | null {
  const column = snapshot.columns.find(candidate => candidate.id === slot.columnId);
  if (!column) return null;

  const isOwn = column.tasks.some(task => task.id === activeId);
  return {
    columnTitle: column.title,
    position: slot.index + 1,
    total: isOwn ? column.tasks.length : column.tasks.length + 1,
  };
}

function describePlacement(placement: Placement): string {
  return `${placement.columnTitle}, position ${placement.position} of ${placement.total}`;
}

/**
 * What a screen reader is told as a card is carried. Every message names the
 * task and the column, never an id, and none of them is spoken for a drop on
 * nothing.
 */
export function createAnnouncements(getSnapshot: () => BoardSnapshot) {
  const titleOf = (snapshot: BoardSnapshot, activeId: string) => findCard(snapshot, activeId)?.task.title ?? 'The task';

  const placementOfOver = (snapshot: BoardSnapshot, activeId: string, overId: string | undefined) => {
    const slot = overId === undefined ? null : slotOfOver(snapshot, activeId, overId);
    return slot ? placementOfSlot(snapshot, activeId, slot) : null;
  };

  // dnd-kit reports the card as hovering itself the moment it is picked up,
  // and that report would replace the pickup message a moment after it was
  // spoken. It is skipped once, and only that once: coming back to the
  // starting place later is worth saying.
  let pickupPending = false;

  return {
    onDragStart({ active }: { active: { id: string | number } }): string {
      const snapshot = getSnapshot();
      const id = String(active.id);
      pickupPending = true;

      const placement = placementOfOver(snapshot, id, id);
      return placement
        ? `Picked up ${titleOf(snapshot, id)}. ${describePlacement(placement)}.`
        : `Picked up ${titleOf(snapshot, id)}.`;
    },

    onDragOver({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) {
      const id = String(active.id);
      const wasPending = pickupPending;
      pickupPending = false;
      if (wasPending && over && String(over.id) === id) return undefined;

      const snapshot = getSnapshot();
      const placement = placementOfOver(snapshot, id, over ? String(over.id) : undefined);
      return placement ? `${describePlacement(placement)}.` : `${titleOf(snapshot, id)} is not over a column.`;
    },

    onDragEnd({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }): string {
      pickupPending = false;
      const snapshot = getSnapshot();
      const id = String(active.id);
      const title = titleOf(snapshot, id);
      const slot = over ? slotOfOver(snapshot, id, String(over.id)) : null;
      const placement = slot ? placementOfSlot(snapshot, id, slot) : null;
      if (!slot || !placement) return `${title} was dropped. It was not moved.`;

      const origin = findCard(snapshot, id);
      const unchanged = origin?.column.id === slot.columnId && origin.index === slot.index;
      return unchanged
        ? `${title} was dropped where it started. ${describePlacement(placement)}.`
        : `Dropped ${title} in ${describePlacement(placement)}.`;
    },

    onDragCancel({ active }: { active: { id: string | number } }): string {
      pickupPending = false;
      const snapshot = getSnapshot();
      const id = String(active.id);
      const placement = placementOfOver(snapshot, id, id);
      return placement
        ? `Move cancelled. ${titleOf(snapshot, id)} is back in ${describePlacement(placement)}.`
        : 'Move cancelled.';
    },
  };
}

export const SCREEN_READER_INSTRUCTIONS =
  'Press Space or Enter to pick up this task. Arrow Up and Down move it within its column. Arrow Left and Right move it to the neighbouring column. Press Space or Enter to drop it, or Escape to cancel.';

const DIRECTIONS: Record<string, KeyboardDirection> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/** The gap below the last card of a column where a card carried there would sit. */
const END_SLOT_GAP = 12;

interface TargetRef {
  current: KeyboardTarget | null;
}

export interface BoardKeyboardOptions {
  getSnapshot: () => BoardSnapshot;
  /**
   * The slot the held card is over. The getter writes it on every move and the
   * collision detection reads it, which is how the two agree on where the card
   * is without either asking the screen.
   */
  target: TargetRef;
}

/**
 * The coordinates dnd-kit's keyboard sensor moves the overlay to.
 *
 * The target is chosen by `stepSlot`, which is deterministic. Its position on
 * screen is read from the document rather than from the rectangles dnd-kit
 * measured when the drag began, because the row of columns and the column
 * bodies scroll and a rectangle taken before a scroll is where the card used
 * to be.
 *
 * Moving to another column also brings the target into view inside that
 * column's own scroller. The row is left to the sensor: it scrolls the row by
 * the distance to the target, and scrolling it here as well would scroll it
 * twice.
 */
export function createBoardCoordinateGetter({ getSnapshot, target }: BoardKeyboardOptions): KeyboardCoordinateGetter {
  return (event, { context }) => {
    const direction = DIRECTIONS[event.code];
    if (!direction) return undefined;
    event.preventDefault();

    const { active, over, droppableRects, droppableContainers } = context;
    if (!active) return undefined;

    const snapshot = getSnapshot();
    const activeId = String(active.id);
    const current =
      target.current?.slot ??
      slotOfOver(snapshot, activeId, over ? String(over.id) : activeId) ??
      slotOfOver(snapshot, activeId, activeId);
    if (!current) return undefined;

    const slot = stepSlot(snapshot, activeId, current, direction);
    if (!slot) return undefined;

    const overId = overIdOfSlot(snapshot, slot);
    if (!overId) return undefined;
    target.current = { slot, overId };

    const column = snapshot.columns.find(candidate => candidate.id === slot.columnId);
    const isOwnColumn = column?.tasks.some(task => task.id === activeId) ?? false;

    const nodeOf = (id: string) => droppableContainers.get(id)?.node.current ?? null;
    const rectOf = (id: string) => {
      const node = nodeOf(id);
      if (node) {
        const { left, top, width, height } = node.getBoundingClientRect();
        return { left, top, width, height };
      }
      const measured = droppableRects.get(id);
      return measured
        ? { left: measured.left, top: measured.top, width: measured.width, height: measured.height }
        : null;
    };

    if (!isOwnColumn && column) revealInColumn(nodeOf(column.id), nodeOf(overId));

    // The end of a column that is not the card's own is the column's body, which
    // is far taller than a card. The overlay goes under the last card instead,
    // or to the top of the body when the column is empty.
    const isEnd = column !== undefined && overId === column.id;
    const lastCard = isEnd ? column.tasks[column.tasks.length - 1] : undefined;
    const anchor = isEnd && lastCard ? rectOf(lastCard.id) : rectOf(overId);
    if (!anchor) return undefined;

    return {
      x: anchor.left,
      y: isEnd && lastCard ? anchor.top + anchor.height + END_SLOT_GAP : anchor.top,
    };
  };
}

/** Scrolls a column's body just enough that a card inside it is fully visible. */
function revealInColumn(body: HTMLElement | null, card: HTMLElement | null) {
  if (!body || !card || body === card) return;
  const bodyRect = body.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  if (cardRect.top < bodyRect.top) body.scrollTop -= bodyRect.top - cardRect.top;
  else if (cardRect.bottom > bodyRect.bottom) body.scrollTop += cardRect.bottom - bodyRect.bottom;
}

/**
 * Collision detection that defers to the keyboard while a card is being
 * carried with it, and to the pointer-oriented default otherwise.
 *
 * A rectangle can only be matched to a droppable approximately, and the
 * overlay sits over a card that is shorter than the column body around it.
 * The keyboard already knows which droppable it chose, so it says so.
 */
export function createCollisionDetection(target: TargetRef): CollisionDetection {
  return args => {
    const keyboard = target.current;
    return keyboard ? [{ id: keyboard.overId }] : closestCorners(args);
  };
}
