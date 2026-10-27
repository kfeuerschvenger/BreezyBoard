import { useMemo } from 'react';
import type { Board, Task } from '@/models';
import { toColorLookup, useColors } from '@/features/colors';
import type { ColorLookup } from '@/features/colors';
import { useBoard } from '@/features/boards';
import { isAddressUnreachable } from '@/shared/lib/httpStatus';
import { DEFAULT_HUE } from '@/shared/ui';
import { useBoardTasks, useTaskCacheWriter } from '../queries';

/** A board column as the page renders it, with its colour already resolved. */
export interface ColumnData {
  _id: string;
  id: string;
  title: string;
  /** The key of the column's hue, which the column's dot is drawn in. */
  color: string;
  order: number;
}

export interface UseBoardDataResult {
  board: Board | null;
  columns: ColumnData[];
  tasks: Task[];
  cache: ReturnType<typeof useTaskCacheWriter>;
  /** The task palette, read once for the whole board. */
  taskColors: ColorLookup;
  isLoading: boolean;
  /**
   * The address does not lead to a board this person can see: it is missing,
   * deleted, not theirs, or not an id at all. Retrying cannot change that, so
   * it is kept apart from `error`, which is the failures where it can.
   */
  notFound: boolean;
  /** The one message worth showing instead of the board. */
  error: string | null;
}

const NO_TASKS: Task[] = [];

/**
 * One board, its columns and its tasks.
 *
 * The columns are the board's own, not its template's. They were copied out
 * of the template when the board was created and have belonged to it since,
 * which is what lets one board rename a column without renaming it on every
 * other board built from the same template.
 */
export function useBoardData(boardId?: string): UseBoardDataResult {
  const boardQuery = useBoard(boardId);
  const tasksQuery = useBoardTasks(boardId);
  const cache = useTaskCacheWriter(boardId);

  // One request for the task palette, however many cards the board holds.
  const { data: palette } = useColors('task');
  const taskColors = useMemo(() => toColorLookup(palette ?? []), [palette]);

  const board = boardQuery.data ?? null;

  const columns = useMemo<ColumnData[]>(
    () =>
      (board?.columns ?? [])
        .map(column => ({
          id: column._id,
          _id: column._id,
          title: column.title,
          color: typeof column.color === 'string' ? column.color : (column.color?.value ?? DEFAULT_HUE),
          order: column.order,
        }))
        .sort((a, b) => a.order - b.order),
    [board]
  );

  const notFound = isAddressUnreachable(boardQuery.error) || isAddressUnreachable(tasksQuery.error);

  return {
    board,
    columns,
    tasks: tasksQuery.data ?? NO_TASKS,
    taskColors,
    cache,
    // An address with no board in it is not a load in progress, so the page
    // reports that rather than waiting on two queries that never ran.
    isLoading: Boolean(boardId) && (boardQuery.isPending || tasksQuery.isPending),
    notFound,
    error: !boardId
      ? 'No board was specified in the address.'
      : boardQuery.isError || tasksQuery.isError
        ? 'This board could not be loaded. Check your connection and try again.'
        : null,
  };
}

export default useBoardData;
