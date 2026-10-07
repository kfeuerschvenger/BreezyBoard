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

/** Where keyboard focus should go once a moved card has been re-rendered. */
export interface FocusRequest {
  taskId: string;
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
  /** The latest result of a menu move, for a polite live region. */
  announcement: string;
  /** Set after a menu move so the page can return focus to the card. */
  focusRequest: FocusRequest | null;
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
  const [announcement, setAnnouncement] = useState('');
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const nonce = useRef(0);

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
      nonce.current += 1;
      setFocusRequest({ taskId: task._id, nonce: nonce.current });

      // No card to land on, so the card goes to the bottom of the column. That
      // is where a drop on a column's empty space lands too, and where a
      // finished checklist sends a task, so every way of arriving in a column
      // without choosing a position agrees.
      const outcome = await move(task, target.id);

      if (outcome === 'moved') setAnnouncement(`Moved ${task.title} to ${target.title}.`);
      if (outcome === 'failed') setAnnouncement(`Could not move ${task.title} to ${target.title}.`);

      return outcome;
    },
    [move],
  );

  return { move, moveToColumn, announcement, focusRequest };
}

export default useTaskMover;
