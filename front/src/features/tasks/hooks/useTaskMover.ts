import { useCallback, useEffect, useRef, useState } from 'react';
import type { Task } from '@/models';
import { TaskService } from '@/services';
import { arrangeColumn, neighboursOf } from '@/features/board';

export interface TaskCache {
  write: (tasks: Task[]) => void;
  replace: (task: Task) => void;
  refetch: () => Promise<unknown> | void;
}

/** A column a task can be moved into, as the move menu names it. */
export interface MoveTarget {
  id: string;
  title: string;
}

/**
 * How a move ended.
 *
 * `unchanged` is a drop that would leave the card where it is, which sends no
 * request. `superseded` is a request this client abandoned for a newer one:
 * the newer one owns the board's state, so the caller must not announce or
 * restore anything on behalf of the old one.
 */
export type MoveOutcome = 'moved' | 'unchanged' | 'superseded' | 'failed';

/** The control on a card that can take focus back after the card has moved. */
export type FocusTarget = 'move-trigger' | 'drag-handle';

/** Where keyboard focus should go once a moved card has been re-rendered. */
export interface FocusRequest {
  taskId: string;
  target: FocusTarget;
  /** Distinguishes two requests for the same task, so the second still fires. */
  nonce: number;
}

export interface UseTaskMoverOptions {
  tasks: Task[];
  cache: TaskCache;
}

export interface UseTaskMoverResult {
  /**
   * Move a card to a column, optionally onto a card in it. The one path every
   * way of moving a task goes through: the optimistic cache write, the server
   * `/move` request with neighbour keys, and the in-flight guard.
   */
  move: (task: Task, targetColumnId: string, overTask?: Task) => Promise<MoveOutcome>;
  /**
   * The single-pointer alternative to dragging: send a card to the end of a
   * column and announce the result.
   */
  moveToColumn: (task: Task, target: MoveTarget) => Promise<MoveOutcome>;
  /** The latest result of a move the mover announces itself, for a polite live region. */
  announcement: string;
  /**
   * Changes with every announcement, including one whose words are the same
   * as the last. The region renders the message under this key: a screen
   * reader speaks what is added to a live region, and text rewritten to what
   * it already said is not added, so the same failure twice in a row would be
   * heard once.
   */
  announcementId: number;
  /**
   * Says something in that live region. A drag is announced by dnd-kit's own,
   * so the only thing it needs this for is the one thing dnd-kit cannot know:
   * that the request failed.
   */
  announce: (message: string) => void;
  /** Set after a move so the page can return focus to the card. */
  focusRequest: FocusRequest | null;
  /**
   * Asks the page to focus a control on a card once the card has re-rendered.
   * A card that changes column is a new element, so the one that had focus is
   * gone by the time the move is done.
   */
  requestFocus: (taskId: string, target: FocusTarget) => void;
}

/**
 * Moving a card, however it was asked for.
 *
 * Two rules below were findings before they were code, so they are the ones
 * any change here has to keep. Drag and drop and the "Move to" menu share this
 * hook so they share both: a drag started while a menu move is in flight
 * aborts it exactly as a second drag would.
 */
export function useTaskMover({ tasks, cache }: UseTaskMoverOptions): UseTaskMoverResult {
  const [spoken, setSpoken] = useState({ message: '', id: 0 });
  const announce = useCallback((message: string) => setSpoken(previous => ({ message, id: previous.id + 1 })), []);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const nonce = useRef(0);

  const requestFocus = useCallback((taskId: string, target: FocusTarget) => {
    nonce.current += 1;
    setFocusRequest({ taskId, target, nonce: nonce.current });
  }, []);

  // The move request currently in flight, if any. A second move started
  // before the first one answers aborts it rather than racing it: without
  // this, a slow first request can resolve after a second one and roll its
  // own stale snapshot back over an update already on screen. That is
  // finding P2-6.
  const inFlightMove = useRef<AbortController | null>(null);

  useEffect(() => () => inFlightMove.current?.abort(), []);

  const move = useCallback(
    async (task: Task, targetColumnId: string, overTask?: Task): Promise<MoveOutcome> => {
      // Build the column exactly as it will look after the move, then read
      // the moved card's neighbours out of it. One arrangement drives both
      // the optimistic render and the request, so the two cannot disagree.
      const arranged = arrangeColumn(tasks, task, targetColumnId, overTask);
      if (!arranged) return 'unchanged';

      inFlightMove.current?.abort();
      const controller = new AbortController();
      inFlightMove.current = controller;

      // Straight into the query cache rather than into component state. This
      // is the external write path the data layer exists for: the same one a
      // server-sent event would use, exercised every time a card moves.
      cache.write([
        ...tasks.filter(other => other.status !== targetColumnId && other._id !== task._id),
        ...arranged.column,
      ]);

      try {
        const moved = await TaskService.move(task._id, targetColumnId, neighboursOf(arranged), controller.signal);

        // The server owns the ordering key, so the card is replaced with what
        // it actually wrote rather than left holding the placeholder used for
        // the optimistic render.
        cache.replace(moved);
        return 'moved';
      } catch (error) {
        // A move this client abandoned because a newer one replaced it. The
        // newer one owns the board's state now, so touching it here is
        // exactly the rollback-over-a-newer-update this guard exists to
        // prevent.
        if (controller.signal.aborted) return 'superseded';

        // Anything else, including the 409 the server sends when the
        // neighbours have moved, is answered by asking the server what the
        // board actually looks like. Restoring a snapshot taken before the
        // move would be wrong for the same reason: by now it may be older
        // than changes that did land.
        console.error('Error moving task:', error);
        await cache.refetch();
        return 'failed';
      } finally {
        if (inFlightMove.current === controller) inFlightMove.current = null;
      }
    },
    [tasks, cache],
  );

  const moveToColumn = useCallback(
    async (task: Task, target: MoveTarget): Promise<MoveOutcome> => {
      // The card leaves the DOM the moment the optimistic write lands, taking
      // keyboard focus with it. Asking for focus up front lets the page put
      // it back on the card's new copy as soon as that exists.
      requestFocus(task._id, 'move-trigger');

      // No card to land on, so the card goes to the bottom of the column. That
      // is where a drop on a column's empty space lands too, and where a
      // finished checklist sends a task, so every way of arriving in a column
      // without choosing a position agrees.
      const outcome = await move(task, target.id);

      if (outcome === 'moved') announce(`Moved ${task.title} to ${target.title}.`);
      if (outcome === 'failed') announce(`Could not move ${task.title} to ${target.title}.`);

      return outcome;
    },
    [move, requestFocus, announce],
  );

  return {
    move,
    moveToColumn,
    announcement: spoken.message,
    announcementId: spoken.id,
    announce,
    focusRequest,
    requestFocus,
  };
}

export default useTaskMover;
