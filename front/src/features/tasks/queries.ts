import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BoardService, TaskService } from '@/services';
import { byOrder } from '@/features/board';
import type { Task } from '@/models';

/**
 * Query keys for a single board and its tasks.
 *
 * Kept in one object for the same reason as the board list keys: a key typed
 * differently at one call site shows up as a view that quietly stops
 * refreshing, which is indistinguishable from having no cache at all.
 */
export const boardKeys = {
  detail: (boardId: string) => ['board', boardId] as const,
};

export const taskKeys = {
  byBoard: (boardId: string) => ['tasks', 'board', boardId] as const,
};

export const useBoard = (boardId?: string) =>
  useQuery({
    queryKey: boardKeys.detail(boardId ?? ''),
    queryFn: () => BoardService.getById(boardId as string),
    enabled: Boolean(boardId),
  });

export const useBoardTasks = (boardId?: string) =>
  useQuery({
    queryKey: taskKeys.byBoard(boardId ?? ''),
    queryFn: () => TaskService.getByBoard(boardId as string),
    enabled: Boolean(boardId),
    // Sorted once, here, rather than at every place that reads the list. The
    // server sorts too; this keeps the order correct for optimistic writes
    // that land in the cache before any response comes back.
    select: tasks => [...tasks].sort(byOrder),
  });

/**
 * Write access to the cached task list, which is the point of this whole
 * layer rather than a convenience.
 *
 * Section 11.4 decided against a real-time transport on the grounds that the
 * expensive thing to retrofit is not the transport but whether the cache can
 * be written by something that is not a fetch. This is that entry point. The
 * drag handler uses it for optimistic updates today; a Server-Sent Events
 * stream would use the same one tomorrow and no page would change.
 */
export const useTaskCacheWriter = (boardId?: string) => {
  const queryClient = useQueryClient();
  const key = taskKeys.byBoard(boardId ?? '');

  return {
    /** Replace the list, for an optimistic render. */
    write: (tasks: Task[]) => queryClient.setQueryData(key, tasks),

    /** Replace one task with what the server actually wrote. */
    replace: (task: Task) =>
      queryClient.setQueryData<Task[]>(key, previous =>
        previous ? previous.map(entry => (entry._id === task._id ? task : entry)) : previous
      ),

    /** Read the list as the cache currently holds it. */
    read: () => queryClient.getQueryData<Task[]>(key),

    /**
     * Ask the server what the list really looks like.
     *
     * Used on any failed write. Restoring a snapshot taken before the action
     * would be wrong for the same reason the original drag defect was wrong:
     * by the time the failure arrives that snapshot may be older than
     * changes which did land.
     */
    refetch: () => queryClient.invalidateQueries({ queryKey: key }),
  };
};
