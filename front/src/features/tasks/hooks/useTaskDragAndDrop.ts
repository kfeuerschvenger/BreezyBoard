import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CollisionDetection, DndContextProps, DragEndEvent, DragMoveEvent, DragStartEvent } from '@dnd-kit/core';
import { KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { Task } from '@/models';
import { dropTargetOf, pointerSlot, sameSlot } from '../dropSlot';
import { readMidpoints } from '../dropGeometry';
import {
  buildSnapshot,
  createAnnouncements,
  createBoardCoordinateGetter,
  createCollisionDetection,
  SCREEN_READER_INSTRUCTIONS,
  slotOfOver,
} from '../keyboardDrag';
import type { KeyboardTarget, Slot } from '../keyboardDrag';
import { useTaskMover } from './useTaskMover';
import type { MoveTarget, TaskCache, UseTaskMoverResult } from './useTaskMover';

export type { TaskCache } from './useTaskMover';

export interface UseTaskDragAndDropOptions {
  tasks: Task[];
  /** The columns a card may be dropped on, in board order. */
  columns: MoveTarget[];
  cache: TaskCache;
  /**
   * The vertical midpoints of a column's cards other than the held one, top to
   * bottom. It reads the screen, which is the one thing a test cannot do, so a
   * test supplies it.
   */
  measureMidpoints?: (columnId: string, heldId: string) => readonly number[];
}

export interface UseTaskDragAndDropResult {
  /** The card currently held, for the drag overlay. */
  activeTask: Task | null;
  /**
   * Where the held card would land if it were dropped now: the column and the
   * index it would take. The gap is drawn there and that column is
   * highlighted. Null when nothing is held, or the card is over no column.
   */
  slot: Slot | null;
  /** The card that was just dropped, which settles into place. Null once it has. */
  landedId: string | null;
  /** Called when a card has finished settling, so the flag does not outlive it. */
  onLandingEnd: (taskId: string) => void;
  sensors: ReturnType<typeof useSensors>;
  collisionDetection: CollisionDetection;
  /** What a screen reader hears while a card is carried, naming tasks and columns. */
  accessibility: NonNullable<DndContextProps['accessibility']>;
  onDragStart: (event: DragStartEvent) => void;
  onDragMove: (event: DragMoveEvent) => void;
  onDragEnd: (event: DragEndEvent) => Promise<void>;
  onDragCancel: () => void;
  /**
   * The move path a drop ends on, which the "Move to" menu shares. It lives on
   * this result so one in-flight guard covers both ways of moving a card.
   */
  mover: UseTaskMoverResult;
}

/**
 * Picking a card up and putting it down.
 *
 * Lifted out of the board page because it is business logic rather than
 * markup, and because none of it could be tested where it was. What a drop
 * turns into, the optimistic write, the request and the in-flight guard, is
 * `useTaskMover`; this hook is the part that is specific to dnd-kit: the
 * sensors, the held card, and reading where it would land.
 *
 * Where it would land is one value, the slot, for both devices. The keyboard
 * sensor steps through positions on the board rather than through screen
 * geometry, see `keyboardDrag`, and the pointer is turned into the same value
 * from the held card's centre against the cards of the column it is over, see
 * `dropSlot`. The gap, the column highlight and the move a drop sends all read
 * that slot, so they cannot show one place and do another.
 */
export function useTaskDragAndDrop({
  tasks,
  columns,
  cache,
  measureMidpoints = readMidpoints,
}: UseTaskDragAndDropOptions): UseTaskDragAndDropResult {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [landedId, setLandedId] = useState<string | null>(null);
  const mover = useTaskMover({ tasks, cache });

  // The keyboard getter, the collision detection and the announcements are
  // created once and read the board through a ref, so the sensor never holds a
  // stale board and the context is not handed new functions on every render.
  const snapshot = useMemo(() => buildSnapshot(columns, tasks), [columns, tasks]);
  const snapshotRef = useRef(snapshot);
  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const keyboardTarget = useRef<KeyboardTarget | null>(null);
  const coordinateGetter = useMemo(
    () => createBoardCoordinateGetter({ getSnapshot: () => snapshotRef.current, target: keyboardTarget }),
    [],
  );
  const collisionDetection = useMemo(() => createCollisionDetection(keyboardTarget), []);
  // Read through refs for the same reason as the getter above: the
  // announcements are created once, and what they say must follow the board.
  const measureRef = useRef(measureMidpoints);
  useEffect(() => {
    measureRef.current = measureMidpoints;
  }, [measureMidpoints]);

  const accessibility = useMemo(
    () => ({
      announcements: createAnnouncements(
        () => snapshotRef.current,
        // What is spoken is where a drop would land, so it is read the way a
        // drop reads it. A keyboard drag has chosen its slot and says it; a
        // pointer drag has the held card's centre against the column's cards.
        (active, over) =>
          keyboardTarget.current?.slot ??
          pointerSlot({
            snapshot: snapshotRef.current,
            activeId: String(active.id),
            overId: String(over.id),
            held: active.rect?.current?.translated ?? null,
            midpointsOf: columnId => measureRef.current(columnId, String(active.id)),
          }),
      ),
      screenReaderInstructions: { draggable: SCREEN_READER_INSTRUCTIONS },
    }),
    [],
  );

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter }));

  /**
   * The slot a drag event is over. A keyboard drag has already chosen one,
   * and before its first arrow key the held card is where it started. A
   * pointer drag is measured.
   */
  const slotOf = (
    activeId: string,
    event: Pick<DragMoveEvent, 'over' | 'activatorEvent'> & { active?: DragMoveEvent['active'] },
  ): Slot | null => {
    const overId = event.over ? String(event.over.id) : undefined;

    if (event.activatorEvent instanceof KeyboardEvent) {
      return keyboardTarget.current?.slot ?? slotOfOver(snapshot, activeId, overId ?? activeId);
    }

    return pointerSlot({
      snapshot,
      activeId,
      overId,
      held: event.active?.rect?.current?.translated ?? null,
      midpointsOf: columnId => measureMidpoints(columnId, activeId),
    });
  };

  const publish = (next: Slot | null) => setSlot(previous => (sameSlot(previous, next) ? previous : next));

  const onDragStart = (event: DragStartEvent) => {
    keyboardTarget.current = null;
    const id = String(event.active.id);
    setActiveTask(tasks.find(task => task._id === id) ?? null);
    // The gap opens where the card was, so lifting one changes nothing about
    // the layout of the others until it is carried somewhere else.
    publish(slotOfOver(snapshot, id, id));
  };

  const onDragMove = (event: DragMoveEvent) => publish(slotOf(String(event.active.id), event));

  const release = () => {
    // After the monitors have run. dnd-kit calls this hook's handler and then
    // the announcements, and the drop announcement reads the keyboard's slot,
    // so clearing it here would make it read a pointer's geometry instead. A
    // microtask runs once that call stack has unwound; the next pick up clears
    // it as well.
    queueMicrotask(() => {
      keyboardTarget.current = null;
    });
    setActiveTask(null);
    publish(null);
  };

  const onDragCancel = () => release();

  const onDragEnd = async (event: DragEndEvent) => {
    const { over, activatorEvent } = event;
    const target = over && activeTask ? slotOf(activeTask._id, event) : null;
    const drop = target ? dropTargetOf(snapshot, target) : null;

    if (!activeTask || !drop) {
      release();
      return;
    }

    // A card carried with the keyboard that lands in another column is a new
    // element and the handle that had focus is gone, so the page is asked to
    // focus the handle where the card now stands.
    if (activatorEvent instanceof KeyboardEvent) mover.requestFocus(activeTask._id, 'drag-handle');

    // `move` writes the cache synchronously before its first await, so the
    // card is already in its new column when the overlay is released.
    const pending = mover.move(activeTask, drop.columnId, tasks.find(task => task._id === drop.overTaskId));
    const held = activeTask;
    setLandedId(held._id);
    release();

    // dnd-kit announces the drop. A request that then fails is the one thing
    // it cannot know, and it is said through the mover's own live region so no
    // move is announced twice.
    if ((await pending) === 'failed') {
      const title = columns.find(column => column.id === drop.columnId)?.title ?? 'that column';
      mover.announce(`Could not move ${held.title} to ${title}.`);
    }
  };

  const onLandingEnd = useCallback(
    (taskId: string) => setLandedId(current => (current === taskId ? null : current)),
    [],
  );

  return {
    activeTask,
    slot,
    landedId,
    onLandingEnd,
    sensors,
    collisionDetection,
    accessibility,
    onDragStart,
    onDragMove,
    onDragEnd,
    onDragCancel,
    mover,
  };
}

export default useTaskDragAndDrop;
