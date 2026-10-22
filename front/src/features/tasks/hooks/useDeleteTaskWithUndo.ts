import type { Task } from '@/models';
import { TaskService } from '@/services';
import { byOrder } from '@/features/board';
import { useToast } from '@/shared/hooks/useToast';
import { httpStatusOf } from '@/shared/lib/httpStatus';
import type { TaskCache } from './useTaskMover';

/** The cache as deletion needs it: the list itself, to remove from and to put back into. */
export interface DeletionCache extends TaskCache {
  read: () => Task[] | undefined;
}

/** A card that has just left the board, and the card that was below it. */
export interface RemovedTask {
  task: Task;
  /** The card that stood directly below it in its column, or null when it was last. */
  beforeId: string | null;
}

export interface UseDeleteTaskWithUndoOptions {
  cache: DeletionCache;
  /**
   * Called when the server has deleted the task, immediately before the card
   * leaves the cache. It is how the board keeps the card on screen long enough
   * to play its exit: the list no longer holds it, and nothing here waits.
   */
  onRemoved?: (removed: RemovedTask) => void;
}

export interface UseDeleteTaskWithUndoResult {
  /** Rejects when the delete fails, so the caller can say so where the person is looking. */
  deleteTask: (task: Task) => Promise<void>;
}

/**
 * Deleting a card, with the way back that the toast offers.
 *
 * The server marks a task deleted and keeps it for a week, so "Catch it" asks
 * it to clear the mark. The card that comes back is the same document, with
 * the same id, dates and position, and the list sorts it into the place it
 * stood in: nothing is rebuilt from what the client held.
 *
 * Everything the toast needs is the task's id and title, captured when it is
 * made, because the page that raised it may be gone by the time it is pressed.
 * A failed catch says so, and offers to try again only when trying again can
 * change the answer: a 400, 403 or 404 means the task is past its week, or the
 * board was deleted, or the person lost access, and the same request would be
 * refused again.
 */
export const useDeleteTaskWithUndo = ({ cache, onRemoved }: UseDeleteTaskWithUndoOptions): UseDeleteTaskWithUndoResult => {
  const toast = useToast();

  const catchIt = async (taskId: string, title: string): Promise<void> => {
    try {
      const restored = await TaskService.restore(taskId);

      const current = cache.read();
      // A board whose list is not held any more has nothing to add to: the
      // next read of it asks the server, which has the card again.
      if (current) {
        cache.write(current.some(entry => entry._id === restored._id) ? current : [...current, restored]);
      } else {
        await cache.refetch();
      }

      toast.show({ message: `Caught "${title}".` });
    } catch (error) {
      const status = httpStatusOf(error);

      if (status === 400 || status === 403 || status === 404) {
        toast.show({ message: `"${title}" can no longer be brought back.` });
        return;
      }

      toast.show({
        message: `"${title}" could not be brought back.`,
        action: { label: 'Try again', onAction: () => void catchIt(taskId, title) },
      });
    }
  };

  const deleteTask = async (task: Task): Promise<void> => {
    const column = (cache.read() ?? []).filter(other => other.status === task.status).sort(byOrder);
    const index = column.findIndex(other => other._id === task._id);
    const beforeId = index >= 0 && index < column.length - 1 ? column[index + 1]._id : null;

    await TaskService.delete(task._id);

    onRemoved?.({ task, beforeId });
    // Read again: the list may have changed while the request was in flight.
    cache.write((cache.read() ?? []).filter(other => other._id !== task._id));
    toast.show({
      message: 'Card blown away.',
      action: { label: 'Catch it', onAction: () => void catchIt(task._id, task.title) },
    });
  };

  return { deleteTask };
};

export default useDeleteTaskWithUndo;
